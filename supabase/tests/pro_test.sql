-- Pruebas de la migración 3: plan Pro compartido, presupuestos, etiquetas y Mercado Pago.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'otro@example.com');

create or replace function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

set role authenticated;

-- Ana y Beto comparten un grupo.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select create_group('22222222-2222-2222-2222-222222222222', 'Ana & Beto', 'couple', 'ARS', 1200,
  '{"id": "a1a1a1a1-0000-0000-0000-000000000001", "name": "Ana"}');
insert into members (id, group_id, name, emoji, color) values ('b1b1b1b1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Beto', '🐼', '#FF6B5B');
insert into invites (code, group_id, member_id) values ('pro1', '22222222-2222-2222-2222-222222222222', 'b1b1b1b1-0000-0000-0000-000000000001');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select accept_invite('pro1');

-- Etiquetas y presupuestos.
insert into expenses (id, group_id, description, amount, currency, paid_by, split, date, tags)
values ('e1e1e1e1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Pasajes', 100, 'ARS',
        'b1b1b1b1-0000-0000-0000-000000000001', '{"mode":"equal"}', '2026-10-01', '{viaje,brasil}');
select pg_temp.check((select tags = '{viaje,brasil}' from expenses), 'los gastos guardan etiquetas');
insert into budgets (id, group_id, category, amount) values ('bdbdbdbd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'super', 40000000);
select pg_temp.check((select count(*) = 1 from budgets), 'Beto crea un presupuesto');

-- Plan: nadie tiene Pro todavía.
select pg_temp.check((select plan_status() ->> 'trial_started_at' is null and plan_status() -> 'groups' = '[]'::jsonb), 'sin prueba ni Pro al principio');

-- Nadie puede darse Pro a mano.
do $$ begin
  insert into profiles (user_id, pro_until) values (auth.uid(), now() + interval '10 years');
  raise exception 'FALLÓ: se pudo regalar Pro';
exception when insufficient_privilege then raise notice 'ok: no se puede escribir el plan a mano';
end $$;

-- Beto empieza la prueba: le dura 14 días y no se puede reiniciar.
select start_trial();
select pg_temp.check((select (plan_status() ->> 'trial_started_at')::timestamptz > now() - interval '1 minute'), 'Beto empezó la prueba');
select start_trial();
select pg_temp.check((select count(*) = 1 from profiles), 'empezar de nuevo no crea otra prueba');

-- Ana ve el grupo como Pro gracias a Beto.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(
  (select (plan_status() -> 'groups' -> 0 ->> 'group_id') = '22222222-2222-2222-2222-222222222222'),
  'Pro es para los dos: Ana lo ve en el grupo compartido'
);
select pg_temp.check((select count(*) = 0 from profiles), 'Ana no ve el perfil de Beto');

-- Otro usuario no ve nada de esto.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select plan_status() -> 'groups' = '[]'::jsonb), 'el plan del grupo no se filtra a terceros');
select pg_temp.check((select count(*) = 0 from budgets), 'presupuestos privados del grupo');

-- Mercado Pago: el servidor carga la bandeja; la persona solo puede marcar estado.
reset role;
insert into mp_accounts (user_id, mp_user_id, access_token) values ('00000000-0000-0000-0000-0000000000a1', 123, 'secreto');
insert into mp_inbox (id, user_id, mp_payment_id, direction, amount, currency, description, date)
values ('abababab-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 999, 'out', 1500000, 'ARS', 'Coto', '2026-10-03');
set role authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select (mp_status() ->> 'connected')::boolean), 'Ana tiene Mercado Pago conectado');
do $$ begin
  perform access_token from mp_accounts;
  raise exception 'FALLÓ: la app pudo leer el token de Mercado Pago';
exception when insufficient_privilege then raise notice 'ok: los tokens de Mercado Pago no se pueden leer desde la app';
end $$;
select pg_temp.check((select count(*) = 1 from mp_inbox where status = 'pending'), 'Ana ve su pago para revisar');
update mp_inbox set status = 'added' where id = 'abababab-0000-0000-0000-000000000001';
select pg_temp.check((select status = 'added' from mp_inbox), 'Ana marca el pago como cargado');
do $$ begin
  update mp_inbox set amount = 1 where id = 'abababab-0000-0000-0000-000000000001';
  raise exception 'FALLÓ: se pudo cambiar el monto de un pago';
exception when insufficient_privilege then raise notice 'ok: el monto que vino de Mercado Pago no se puede tocar';
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) = 0 from mp_inbox), 'Beto no ve la bandeja de Ana');
select pg_temp.check((select not (mp_status() ->> 'connected')::boolean), 'Beto no tiene Mercado Pago conectado');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select mp_disconnect();
select pg_temp.check((select not (mp_status() ->> 'connected')::boolean), 'Ana desconecta Mercado Pago');

-- is_pro es solo para el servidor.
do $$ begin
  perform is_pro(auth.uid());
  raise exception 'FALLÓ: la app pudo llamar a is_pro';
exception when insufficient_privilege then raise notice 'ok: is_pro no se puede llamar desde la app';
end $$;
reset role;
select pg_temp.check(is_pro('00000000-0000-0000-0000-0000000000b1'), 'el servidor ve que Beto tiene Pro (prueba)');
select pg_temp.check(is_pro('00000000-0000-0000-0000-0000000000a1'), 'y Ana también, por el grupo');
select pg_temp.check(not is_pro('00000000-0000-0000-0000-0000000000c1'), 'el otro usuario no');
