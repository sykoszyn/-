-- Parejo · migración 2: sincronización, invitaciones y tiempo real.
-- Correr en Supabase → SQL Editor DESPUÉS de 001_schema.sql. Se puede correr más de una vez.

-- ── updated_at en todas las tablas, para traer solo lo que cambió ───────────

alter table groups add column if not exists updated_at timestamptz not null default now();
alter table members add column if not exists updated_at timestamptz not null default now();
alter table settlements add column if not exists updated_at timestamptz not null default now();
alter table bills add column if not exists updated_at timestamptz not null default now();
alter table goals add column if not exists updated_at timestamptz not null default now();
alter table goal_contributions add column if not exists updated_at timestamptz not null default now();

-- Los aportes guardan también el grupo, para filtrar y suscribirse igual que el resto.
alter table goal_contributions add column if not exists group_id uuid references groups (id) on delete cascade;
update goal_contributions c set group_id = g.group_id from goals g where g.id = c.goal_id and c.group_id is null;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function set_contribution_group() returns trigger language plpgsql as $$
begin
  select group_id into new.group_id from goals where id = new.goal_id;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['groups', 'members', 'expenses', 'settlements', 'bills', 'goals', 'goal_contributions'] loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists goal_contributions_group on goal_contributions;
create trigger goal_contributions_group before insert or update of goal_id on goal_contributions
  for each row execute function set_contribution_group();

create index if not exists groups_updated on groups (updated_at);
create index if not exists members_sync on members (group_id, updated_at);
create index if not exists expenses_sync on expenses (group_id, updated_at);
create index if not exists settlements_sync on settlements (group_id, updated_at);
create index if not exists bills_sync on bills (group_id, updated_at);
create index if not exists goals_sync on goals (group_id, updated_at);
create index if not exists contributions_sync on goal_contributions (group_id, updated_at);

alter table expenses alter column created_by set default auth.uid();
alter table invites alter column created_by set default auth.uid();

drop policy if exists "miembros" on goal_contributions;
create policy "miembros" on goal_contributions for all using (is_member(group_id)) with check (is_member(group_id));

-- ── Nadie puede vincular una cuenta a un miembro "a mano" ───────────────────
-- Solo las funciones de abajo (que corren como dueño de la base) asignan user_id.

create or replace function guard_member_user() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated')
     and ((tg_op = 'INSERT' and new.user_id is not null)
       or (tg_op = 'UPDATE' and new.user_id is distinct from old.user_id)) then
    raise exception 'No se puede cambiar la cuenta vinculada a un miembro';
  end if;
  return new;
end $$;

drop trigger if exists members_guard_user on members;
create trigger members_guard_user before insert or update on members
  for each row execute function guard_member_user();

-- ── Funciones que llama la app ──────────────────────────────────────────────

-- Sube un grupo nuevo (creado en el teléfono) y vincula a quien lo crea.
create or replace function create_group(
  p_id uuid, p_name text, p_kind text, p_currency text, p_usd_rate numeric, p_member jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión'; end if;
  if exists (select 1 from members where group_id = p_id and user_id = auth.uid()) then
    return p_id; -- reintento: ya estaba subido
  end if;
  if exists (select 1 from groups where id = p_id) then raise exception 'Ese grupo ya existe'; end if;

  insert into groups (id, name, kind, currency, usd_rate) values (p_id, p_name, p_kind, p_currency, p_usd_rate);
  insert into members (id, group_id, user_id, name, emoji, color, income, alias)
  values (
    (p_member ->> 'id')::uuid, p_id, auth.uid(), p_member ->> 'name',
    coalesce(p_member ->> 'emoji', '🦊'), coalesce(p_member ->> 'color', '#5B4CF0'),
    (p_member ->> 'income')::bigint, p_member ->> 'alias'
  );
  return p_id;
end $$;

-- Lo que ve alguien al abrir un link de invitación, antes de aceptar.
create or replace function invite_preview(p_code text)
returns table (group_name text, member_name text, inviter_name text, status text)
language sql stable security definer set search_path = public as $$
  select g.name,
         m.name,
         (select name from members where group_id = i.group_id and user_id = i.created_by limit 1),
         case
           when i.used_at is not null then 'used'
           when i.expires_at < now() then 'expired'
           else 'ok'
         end
  from invites i
  join groups g on g.id = i.group_id
  left join members m on m.id = i.member_id
  where i.code = p_code;
$$;

-- Acepta una invitación: vincula la cuenta al miembro invitado (o crea uno nuevo).
create or replace function accept_invite(p_code text, p_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invites;
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión'; end if;
  select * into inv from invites where code = p_code for update;
  if not found then raise exception 'La invitación no existe'; end if;
  if exists (select 1 from members where group_id = inv.group_id and user_id = auth.uid()) then
    return inv.group_id; -- ya era parte del grupo
  end if;
  if inv.used_at is not null then raise exception 'Esta invitación ya se usó'; end if;
  if inv.expires_at < now() then raise exception 'La invitación venció. Pedí una nueva.'; end if;

  if inv.member_id is not null and exists (select 1 from members where id = inv.member_id and user_id is null) then
    update members set user_id = auth.uid() where id = inv.member_id;
  else
    insert into members (group_id, user_id, name, emoji, color)
    values (inv.group_id, auth.uid(), coalesce(nullif(trim(p_name), ''), 'Nuevo'), '🐸', '#2FB67C');
  end if;
  update invites set used_at = now() where code = p_code;
  return inv.group_id;
end $$;

-- Salir de un grupo: la persona queda en las cuentas, pero sin cuenta vinculada.
create or replace function leave_group(p_group uuid) returns void
language sql security definer set search_path = public as $$
  update members set user_id = null where group_id = p_group and user_id = auth.uid();
$$;

revoke all on function create_group(uuid, text, text, text, numeric, jsonb) from public, anon;
revoke all on function accept_invite(text, text) from public, anon;
revoke all on function leave_group(uuid) from public, anon;
grant execute on function create_group(uuid, text, text, text, numeric, jsonb) to authenticated;
grant execute on function accept_invite(text, text) to authenticated;
grant execute on function leave_group(uuid) to authenticated;
grant execute on function invite_preview(text) to anon, authenticated;

-- ── Tiempo real: avisar a la app cuando la pareja carga algo ────────────────

do $$
declare t text;
begin
  foreach t in array array['groups', 'members', 'expenses', 'settlements', 'bills', 'goals', 'goal_contributions'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
