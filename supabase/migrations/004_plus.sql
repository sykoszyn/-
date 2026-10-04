-- Parejo · migración 4: Parejo Plus con un mes de prueba (antes 14 días).
-- Correr en Supabase → SQL Editor DESPUÉS de 003_pro.sql. Se puede correr más de una vez.

-- Un solo lugar para la duración de la prueba.
create or replace function trial_days() returns int language sql immutable as $$ select 30 $$;

create or replace function plan_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trial_started_at', (select trial_started_at from profiles where user_id = auth.uid()),
    'pro_until', (select pro_until from profiles where user_id = auth.uid()),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', g.group_id, 'until', g.until))
      from (
        select mine.group_id,
               max(greatest(p.pro_until, p.trial_started_at + make_interval(days => trial_days()))) as until
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

create or replace function is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where greatest(p.pro_until, p.trial_started_at + make_interval(days => trial_days())) > now()
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

revoke all on function plan_status() from public, anon;
grant execute on function plan_status() to authenticated;
revoke all on function is_pro(uuid) from public, anon, authenticated;
