# LinkedIn job sidecar (optional, local only)

Pulls jobs from a LinkedIn search into JobsMarket. Off unless you run it.

Read this first.
- It uses your own logged in LinkedIn session. LinkedIn's terms forbid automated access and can restrict the account. Use an account you can afford to lose.
- `vendor/linkedin_scraper` is GPL-3. It runs here as its own process and only JSON crosses to the app. Never import or copy it into `app/`, `lib/` or `components/`.
- Never run this on Vercel or any server. `linkedin_session.json` holds live LinkedIn cookies and is git ignored.

Setup, once, by you.

```bash
python3 -m venv sidecar/.venv && source sidecar/.venv/bin/activate
pip install -r sidecar/linkedin/requirements.txt && pip install -e vendor/linkedin_scraper
playwright install chromium
python3 vendor/linkedin_scraper/samples/create_session.py   # run from the repo root, log in by hand, it writes linkedin_session.json here (git ignored)
```

Each run.

```bash
python3 sidecar/linkedin/scrape.py --keywords "data analyst" --location Melbourne --limit 10 > jobs.json
curl -X POST http://localhost:3000/api/linkedin/import -H "Authorization: Bearer $CRON_SECRET" --data-binary @jobs.json
```

Jobs land as source `linkedin` after migration `0004_linkedin_source.sql` is applied. They are never closed by absence.
