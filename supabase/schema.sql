-- Parejo · esquema para sincronizar entre dispositivos (fase 2).
-- Pensado para Supabase (Postgres + Auth + Realtime). La app hoy guarda todo
-- localmente; este esquema refleja 1:1 los tipos de `src/domain/types.ts`.
-- Montos: enteros en centavos. Fechas de negocio: `date`.

create extension if not exists "pgcrypto";

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('couple', 'home', 'trip', 'other')),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  usd_rate numeric not null default 1200,
  created_at timestamptz not null default now()
);

-- Una persona del grupo. `user_id` queda null hasta que acepta la invitación
-- (así se pueden cargar gastos de alguien que todavía no tiene la app).
create table members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  emoji text not null default '🦊',
  color text not null default '#5B4CF0',
  income bigint,          -- privado: ver política más abajo
  alias text,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  description text not null,
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  rate numeric not null default 1 check (rate > 0),
  paid_by uuid not null references members (id),
  split jsonb not null,   -- { mode: 'equal' | 'income' | 'custom' | 'full', ... }
  category text not null default 'other',
  date date not null,
  installments int not null default 1 check (installments between 1 and 60),
  bill_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz  -- borrado lógico para sincronizar sin conflictos
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  from_member uuid not null references members (id),
  to_member uuid not null references members (id),
  amount bigint not null check (amount > 0),
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  emoji text not null default '🧾',
  amount bigint not null default 0,
  due_day int not null check (due_day between 1 and 31),
  category text not null,
  split jsonb not null,
  payer_id uuid references members (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table expenses
  add constraint expenses_bill_fk foreign key (bill_id) references bills (id) on delete set null;

create table goals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  emoji text not null default '🎯',
  target bigint not null check (target > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  deadline date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals (id) on delete cascade,
  member_id uuid not null references members (id),
  amount bigint not null,
  date date not null,
  created_at timestamptz not null default now()
);

-- Invitaciones por link: parejo.app/i/<code>
create table invites (
  code text primary key default encode(gen_random_bytes(6), 'hex'),
  group_id uuid not null references groups (id) on delete cascade,
  member_id uuid references members (id) on delete cascade, -- a quién "reclama" el invitado
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);

create index on members (user_id);
create index on expenses (group_id, date);
create index on settlements (group_id, date);
create index on bills (group_id);
create index on goals (group_id);

-- ── Seguridad: cada uno ve y edita solo los grupos de los que es parte ──────

create or replace function is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where group_id = g and user_id = auth.uid());
$$;

alter table groups enable row level security;
alter table members enable row level security;
alter table expenses enable row level security;
alter table settlements enable row level security;
alter table bills enable row level security;
alter table goals enable row level security;
alter table goal_contributions enable row level security;
alter table invites enable row level security;

create policy "miembros ven su grupo" on groups for select using (is_member(id));
create policy "miembros editan su grupo" on groups for update using (is_member(id));
create policy "cualquiera logueado crea grupos" on groups for insert with check (auth.uid() is not null);

create policy "miembros" on members for all using (is_member(group_id)) with check (is_member(group_id));
create policy "miembros" on expenses for all using (is_member(group_id)) with check (is_member(group_id));
create policy "miembros" on settlements for all using (is_member(group_id)) with check (is_member(group_id));
create policy "miembros" on bills for all using (is_member(group_id)) with check (is_member(group_id));
create policy "miembros" on goals for all using (is_member(group_id)) with check (is_member(group_id));
create policy "miembros" on goal_contributions for all
  using (is_member((select group_id from goals where goals.id = goal_id)))
  with check (is_member((select group_id from goals where goals.id = goal_id)));
create policy "miembros" on invites for all using (is_member(group_id)) with check (is_member(group_id));

-- PENDIENTE (fase 2): con estas políticas, nadie puede insertar el primer
-- miembro de un grupo nuevo ni sumarse por invitación. Hay que escribir dos
-- funciones `security definer`: create_group(...) que crea el grupo y su primer
-- miembro con user_id = auth.uid(), y accept_invite(code) que valida el código
-- y asigna user_id al miembro invitado. Así no se abre el insert de `members`.
