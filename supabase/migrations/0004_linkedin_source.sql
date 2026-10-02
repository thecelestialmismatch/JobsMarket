-- Allow job postings imported from a locally run LinkedIn search (see sidecar/linkedin).
alter table public.job_postings drop constraint job_postings_source_check;
alter table public.job_postings add constraint job_postings_source_check
  check (source in ('greenhouse', 'lever', 'ashby', 'remotive', 'adzuna', 'linkedin', 'manual'));
