-- Callers can no longer choose arbitrary keys. The key is the bucket plus the caller's own user id,
-- so the table is bounded by buckets x users and nobody can exhaust someone else's quota.
-- Anonymous uploads are throttled inside create_draft and by the app's per-IP limiter instead.
drop function public.hit_rate_limit(text, integer, integer);

create function public.hit_rate_limit(p_bucket text, p_window_sec integer, p_max integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_hits integer;
begin
  if v_uid is null then
    return false;
  end if;
  if p_bucket !~ '^[a-z_]{1,32}$' or p_window_sec not between 1 and 86400 or p_max not between 1 and 10000 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  insert into public.rate_limits as r (key, window_start, hits)
    values (p_bucket || ':' || v_uid::text, v_start, 1)
    on conflict (key, window_start) do update set hits = r.hits + 1
    returning r.hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.hit_rate_limit(text, integer, integer) to authenticated;
