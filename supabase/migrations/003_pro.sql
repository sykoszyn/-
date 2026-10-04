-- Parejo · migración 3: plan Pro, etiquetas, presupuestos y Mercado Pago.
-- Correr en Supabase → SQL Editor DESPUÉS de 002_sync.sql. Se puede correr más de una vez.

-- ── Etiquetas en los gastos ─────────────────────────────────────────────────
alter table expenses add column if not exists tags text[] not null default '{}';

-- ── Presupuestos mensuales por categoría ────────────────────────────────────
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  category text not null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists budgets_sync on budgets (group_id, updated_at);
alter table budgets enable row level security;
drop policy if exists "miembros" on budgets;
create policy "miembros" on budgets for all using (is_member(group_id)) with check (is_member(group_id));
drop trigger if exists budgets_updated_at on budgets;
create trigger budgets_updated_at before update on budgets for each row execute function set_updated_at();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'budgets') then
    alter publication supabase_realtime add table budgets;
  end if;
end $$;

-- ── Plan de cada persona ────────────────────────────────────────────────────
-- Solo se escribe desde funciones (prueba gratis) o desde el servidor (pagos de Mercado Pago).
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_started_at timestamptz,
  pro_until timestamptz,
  mp_preapproval_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "mi perfil" on profiles;
create policy "mi perfil" on profiles for select using (user_id = auth.uid());
revoke insert, update, delete on profiles from anon, authenticated;
drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();

-- Empieza la prueba gratis de 14 días (una sola vez por persona).
create or replace function start_trial() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión'; end if;
  insert into profiles (user_id, trial_started_at) values (auth.uid(), now())
  on conflict (user_id) do update set trial_started_at = coalesce(profiles.trial_started_at, now());
end $$;

-- Mi plan y, por cada grupo, hasta cuándo tiene Pro gracias a otra persona del grupo.
create or replace function plan_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trial_started_at', (select trial_started_at from profiles where user_id = auth.uid()),
    'pro_until', (select pro_until from profiles where user_id = auth.uid()),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', g.group_id, 'until', g.until))
      from (
        select mine.group_id,
               max(greatest(p.pro_until, p.trial_started_at + interval '14 days')) as until
        from members mine
        join members other on other.group_id = mine.group_id and other.user_id is not null and other.user_id <> auth.uid()
        join profiles p on p.user_id = other.user_id
        where mine.user_id = auth.uid()
        group by mine.group_id
      ) g
      where g.until > now()
    ), '[]'::jsonb)
  );
$$;

revoke all on function start_trial() from public, anon;
revoke all on function plan_status() from public, anon;
grant execute on function start_trial() to authenticated;
grant execute on function plan_status() to authenticated;

-- ── Mercado Pago ────────────────────────────────────────────────────────────
-- Cuentas conectadas: los tokens solo los lee el servidor (sin políticas = nadie desde la app).
create table if not exists mp_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mp_user_id bigint not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table mp_accounts enable row level security;
revoke all on mp_accounts from anon, authenticated;

create or replace function mp_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('connected', count(*) > 0, 'last_synced_at', max(last_synced_at))
  from mp_accounts where user_id = auth.uid();
$$;
create or replace function mp_disconnect() returns void
language sql security definer set search_path = public as $$
  delete from mp_accounts where user_id = auth.uid();
$$;
revoke all on function mp_status() from public, anon;
revoke all on function mp_disconnect() from public, anon;
grant execute on function mp_status() to authenticated;
grant execute on function mp_disconnect() to authenticated;

-- Bandeja: pagos traídos de Mercado Pago, para cargarlos o descartarlos con un toque.
create table if not exists mp_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mp_payment_id bigint not null,
  direction text not null check (direction in ('out', 'in')),
  amount bigint not null,
  currency text not null,
  description text not null,
  counterpart text,
  date date not null,
  status text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, mp_payment_id)
);
create index if not exists mp_inbox_pending on mp_inbox (user_id, status, date desc);
alter table mp_inbox enable row level security;
drop policy if exists "mi bandeja" on mp_inbox;
drop policy if exists "marcar mi bandeja" on mp_inbox;
create policy "mi bandeja" on mp_inbox for select using (user_id = auth.uid());
create policy "marcar mi bandeja" on mp_inbox for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Desde la app solo se puede cambiar el estado (cargado / descartado).
revoke insert, update, delete on mp_inbox from anon, authenticated;
grant update (status) on mp_inbox to authenticated;

-- ¿Tiene Pro esta persona (propio, en prueba, o porque lo paga alguien de un grupo suyo)?
-- Solo la usa el servidor (Vercel) con la clave de servicio.
create or replace function is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where greatest(p.pro_until, p.trial_started_at + interval '14 days') > now()
      and (
        p.user_id = p_user
        or p.user_id in (
          select other.user_id from members mine
          join members other on other.group_id = mine.group_id
          where mine.user_id = p_user and other.user_id is not null
        )
      )
  );
$$;
revoke all on function is_pro(uuid) from public, anon, authenticated;
