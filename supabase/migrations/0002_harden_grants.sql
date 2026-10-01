-- Supabase default privileges grant ALL on new tables and EXECUTE on new functions to anon and
-- authenticated. RLS does not cover TRUNCATE, so strip privileges the app never needs.
revoke truncate, references, trigger on
  public.job_postings, public.drafts, public.candidate_profiles, public.kits, public.tracker,
  public.usage, public.subscriptions, public.rate_limits, public.portfolio_pages
  from anon, authenticated;

revoke execute on function public.claim_draft(uuid, text) from anon;
