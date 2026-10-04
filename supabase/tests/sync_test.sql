-- Prueba de punta a punta de las migraciones con dos personas (Juli y Sofi) y un intruso.
-- Se corre con scripts/test-db.sh sobre un Postgres local (no en Supabase).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'juli@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'sofi@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@example.com');

create or replace function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

set role authenticated;

-- 1. Juli sube su grupo local.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select create_group(
  '11111111-1111-1111-1111-111111111111', 'Juli & Sofi', 'couple', 'ARS', 1200,
  '{"id": "aaaaaaaa-0000-0000-0000-000000000001", "name": "Juli", "emoji": "🦊", "color": "#5B4CF0", "income": 180000000}'
);
-- Reintentar no rompe nada.
select create_group(
  '11111111-1111-1111-1111-111111111111', 'Juli & Sofi', 'couple', 'ARS', 1200,
  '{"id": "aaaaaaaa-0000-0000-0000-000000000001", "name": "Juli"}'
);
select pg_temp.check((select count(*) = 1 from groups), 'Juli ve su grupo');

-- Sofi todavía no tiene la app: Juli la carga como miembro sin cuenta.
insert into members (id, group_id, name, emoji, color)
values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sofi', '🐼', '#FF6B5B');

insert into bills (id, group_id, name, emoji, amount, due_day, category, split, payer_id)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alquiler', '🏠', 65000000, 10, 'home',
        '{"mode": "income"}', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into expenses (id, group_id, description, amount, currency, rate, paid_by, split, category, date, installments, bill_id)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Heladera', 144000000, 'ARS', 1,
        'aaaaaaaa-0000-0000-0000-000000000001', '{"mode": "equal"}', 'home', '2026-10-01', 6, null);
select pg_temp.check((select created_by = auth.uid() from expenses), 'created_by se completa solo');

insert into goals (id, group_id, name, emoji, target, currency)
values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Brasil', '🏖️', 240000, 'USD');
insert into goal_contributions (id, goal_id, member_id, amount, date)
values ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 50000, '2026-10-02');
select pg_temp.check((select group_id = '11111111-1111-1111-1111-111111111111' from goal_contributions), 'el aporte hereda el grupo');

-- Nadie puede "adueñarse" de un miembro a mano.
do $$ begin
  update members set user_id = '00000000-0000-0000-0000-00000000000c' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  raise exception 'FALLÓ: se pudo vincular una cuenta a mano';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok: vincular a mano está bloqueado (%)', sqlerrm;
end $$;

-- 2. Juli invita a Sofi.
insert into invites (code, group_id, member_id) values ('abc123', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.check((select created_by = auth.uid() from invites), 'la invitación registra quién invitó');

-- 3. El intruso no ve nada.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) = 0 from groups), 'el intruso no ve el grupo');
select pg_temp.check((select count(*) = 0 from expenses), 'el intruso no ve gastos');
select pg_temp.check((select count(*) = 0 from invites), 'el intruso no ve invitaciones');
do $$ begin
  insert into expenses (group_id, description, amount, currency, paid_by, split, date)
  values ('11111111-1111-1111-1111-111111111111', 'trampa', 100, 'ARS', 'aaaaaaaa-0000-0000-0000-000000000001', '{"mode":"equal"}', '2026-10-01');
  raise exception 'FALLÓ: el intruso pudo cargar un gasto';
exception when insufficient_privilege then
  raise notice 'ok: el intruso no puede cargar gastos';
end $$;

-- 4. Sofi abre el link: ve de qué se trata antes de aceptar.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(
  (select group_name = 'Juli & Sofi' and member_name = 'Sofi' and inviter_name = 'Juli' and status = 'ok' from invite_preview('abc123')),
  'la vista previa muestra grupo, a quién y quién invita'
);
select pg_temp.check(accept_invite('abc123') = '11111111-1111-1111-1111-111111111111', 'Sofi acepta');
select pg_temp.check(accept_invite('abc123') = '11111111-1111-1111-1111-111111111111', 'aceptar dos veces es inofensivo');
select pg_temp.check((select user_id = auth.uid() from members where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'Sofi quedó vinculada a su miembro');
select pg_temp.check((select count(*) = 1 from expenses), 'Sofi ve los gastos');
select pg_temp.check((select count(*) = 1 from goal_contributions), 'Sofi ve los aportes');

-- Sofi edita un gasto: updated_at avanza.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update expenses set updated_at = '2000-01-01' where id = 'dddddddd-0000-0000-0000-000000000001';
update expenses set description = 'Heladera nueva' where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.check((select description = 'Heladera nueva' and updated_at > '2001-01-01' from expenses), 'Sofi puede editar y updated_at se actualiza solo');

-- 5. El intruso no puede usar una invitación ya usada.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
do $$ begin
  perform accept_invite('abc123');
  raise exception 'FALLÓ: se reusó una invitación';
exception when raise_exception then
  if sqlerrm like 'FALLÓ%' then raise; end if;
  raise notice 'ok: invitación usada rechazada (%)', sqlerrm;
end $$;

-- 6. Sofi se va del grupo: sigue en las cuentas, pero ya no ve nada.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select leave_group('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) = 0 from expenses), 'después de salir, Sofi no ve gastos');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) = 2 from members), 'Sofi sigue como miembro para las cuentas');

reset role;
select pg_temp.check((select count(*) >= 7 from pg_publication_tables where pubname = 'supabase_realtime'), 'tiempo real activado en las tablas del grupo');
