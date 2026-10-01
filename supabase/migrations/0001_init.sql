-- JobsMarket schema. The app talks to Postgres with the publishable (anon) key plus the
-- visitor's session, so every guarantee below is enforced here, not in application code.
-- Writes to jobs and subscriptions happen only with the service role (ingestion cron, billing webhook).

-- Jobs ---------------------------------------------------------------------------------------
create table public.job_postings (
  id text primary key,
  source text not null check (source in ('greenhouse', 'lever', 'ashby', 'remotive', 'adzuna', 'manual')),
  source_id text not null,
  board text,
  company text not null,
  title text not null,
  location text not null default '',
  country text,
  remote text not null default 'unknown' check (remote in ('remote', 'hybrid', 'onsite', 'unknown')),
  employment_type text,
  description text not null default '',
  url text not null,
  apply_url text not null,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text check (salary_period in ('year', 'month', 'day', 'hour')),
  posted_at timestamptz,
  closes_at timestamptz,
  retrieved_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed', 'unknown')),
  skills text[] not null default '{}',
  requirements jsonb not null default '{}'
);
create index job_postings_open_idx on public.job_postings (status, retrieved_at desc);

alter table public.job_postings enable row level security;
create policy "signed in users read jobs" on public.job_postings
  for select to authenticated using (true);
create policy "anonymous visitors read open job features" on public.job_postings
  for select to anon using (status = 'open');

-- Anonymous visitors get a column allowlist. company, description, url, apply_url and salary
-- are never readable with the anon key, even if a client asks for them directly.
revoke all on public.job_postings from anon;
grant select (id, title, location, country, remote, skills, requirements, posted_at, closes_at, status)
  on public.job_postings to anon;
revoke insert, update, delete on public.job_postings from authenticated;

-- Anonymous drafts ------------------------------------------------------------------------------
-- A draft is a parsed CV (never the file) reachable only through a capability token.
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null,
  cv jsonb not null,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete cascade
);
create index drafts_created_idx on public.drafts (created_at);
alter table public.drafts enable row level security; -- no policies, functions only
revoke all on public.drafts from anon, authenticated;

create function public.create_draft(p_cv jsonb)
returns table (id uuid, token text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  if p_cv is null or jsonb_typeof(p_cv) <> 'object' or octet_length(p_cv::text) > 400000 then
    raise exception 'invalid cv payload' using errcode = '22023';
  end if;
  if (select count(*) from public.drafts d where d.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many uploads, try again shortly' using errcode = '54000';
  end if;
  delete from public.drafts d where d.claimed_by is null and d.created_at < now() - interval '7 days';
  insert into public.drafts (token_hash, cv)
    values (sha256(convert_to(v_token, 'UTF8')), p_cv)
    returning drafts.id into v_id;
  return query select v_id, v_token;
end;
$$;

create function public.get_draft(p_id uuid, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select d.cv from public.drafts d
  where d.id = p_id
    and d.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and d.claimed_by is null
    and d.created_at > now() - interval '7 days';
$$;

-- Profiles ----------------------------------------------------------------------------------------
create table public.candidate_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cv jsonb not null,
  prefs jsonb not null default '{}',
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.candidate_profiles enable row level security;
create policy "owner reads profile" on public.candidate_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner inserts profile" on public.candidate_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "owner updates profile" on public.candidate_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner deletes profile" on public.candidate_profiles for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.candidate_profiles from anon;

create function public.claim_draft(p_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cv jsonb;
begin
  if v_uid is null then
    return false;
  end if;
  update public.drafts d set claimed_by = v_uid
    where d.id = p_id
      and d.token_hash = sha256(convert_to(p_token, 'UTF8'))
      and (d.claimed_by is null or d.claimed_by = v_uid)
      and d.created_at > now() - interval '7 days'
    returning d.cv into v_cv;
  if v_cv is null then
    return false;
  end if;
  insert into public.candidate_profiles (user_id, cv) values (v_uid, v_cv)
    on conflict (user_id) do update set cv = excluded.cv, updated_at = now();
  return true;
end;
$$;

-- Application kits and tracker ------------------------------------------------------------------------
create table public.kits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index kits_user_idx on public.kits (user_id, created_at desc);

create table public.tracker (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index tracker_user_idx on public.tracker (user_id, updated_at desc);

do $$
declare t text;
begin
  foreach t in array array['kits', 'tracker'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "owner reads" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner inserts" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner updates" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner deletes" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Usage ledger: append only. No update or delete policy, so deleting kits never refunds quota.
create table public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('kit', 'scan')),
  at timestamptz not null default now()
);
create index usage_user_idx on public.usage (user_id, kind, at);
alter table public.usage enable row level security;
revoke all on public.usage from anon;
revoke update, delete on public.usage from authenticated;
create policy "owner reads usage" on public.usage for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner appends usage" on public.usage for insert to authenticated
  with check (user_id = (select auth.uid()) and at > now() - interval '1 minute');

-- Subscriptions: readable by the owner, written only by the billing webhook (service role).
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'inactive',
  customer_id text unique,
  subscription_id text,
  period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;
create policy "owner reads subscription" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Rate limiting shared across serverless instances ------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security; -- function access only
revoke all on public.rate_limits from anon, authenticated;

create function public.hit_rate_limit(p_key text, p_window_sec integer, p_max integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_key is null or length(p_key) > 200 or p_window_sec not between 1 and 86400 or p_max not between 1 and 10000 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
    on conflict (key, window_start) do update set hits = r.hits + 1
    returning r.hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;

revoke all on function public.create_draft(jsonb) from public;
revoke all on function public.get_draft(uuid, text) from public;
revoke all on function public.claim_draft(uuid, text) from public;
revoke all on function public.hit_rate_limit(text, integer, integer) from public;
grant execute on function public.create_draft(jsonb) to anon, authenticated;
grant execute on function public.get_draft(uuid, text) to anon, authenticated;
grant execute on function public.claim_draft(uuid, text) to authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to anon, authenticated;

-- Portfolio pages ----------------------------------------------------------------------------------
-- Role specific portfolios. Private by default. A page becomes publicly readable only when its
-- owner publishes it, and only the fields stored in data (chosen by the owner) are exposed.
create table public.portfolio_pages (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{6,64}$'),
  role_family text not null,
  data jsonb not null,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create index portfolio_pages_user_idx on public.portfolio_pages (user_id);
alter table public.portfolio_pages enable row level security;
create policy "owner manages portfolio" on public.portfolio_pages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "anyone reads published portfolio" on public.portfolio_pages for select to anon, authenticated
  using (published);
revoke all on public.portfolio_pages from anon;
grant select (slug, role_family, data, published, updated_at) on public.portfolio_pages to anon;
