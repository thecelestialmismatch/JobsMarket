#!/usr/bin/env python3
"""Local only. Prints LinkedIn job search results as a JSON array on stdout.

Run it yourself on your own machine. It drives a real browser with your own LinkedIn session, which
LinkedIn's terms forbid and which can get the account restricted. The scraper is GPL-3, so it stays
in this separate process and only JSON reaches the app. See README.md.
"""
import argparse
import asyncio
import json
import sys

from linkedin_scraper.core.browser import BrowserManager
from linkedin_scraper.scrapers.job import JobScraper
from linkedin_scraper.scrapers.job_search import JobSearchScraper

MAX_LIMIT = 25  # small on purpose, a fast crawl is what gets accounts flagged


async def run(args):
    async with BrowserManager(headless=True) as browser:
        await browser.load_session(args.session)
        urls = await JobSearchScraper(browser.page).search(keywords=args.keywords, location=args.location, limit=args.limit)
        scraper = JobScraper(browser.page)
        jobs = []
        for url in urls:
            try:
                jobs.append((await scraper.scrape(url)).to_dict())
            except Exception as err:  # one bad page must not lose the rest
                print(f"skipped {url}: {type(err).__name__}", file=sys.stderr)
            await asyncio.sleep(args.delay)
    json.dump(jobs, sys.stdout)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--keywords", required=True)
    p.add_argument("--location", required=True)
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--delay", type=float, default=3.0, help="seconds between job pages")
    p.add_argument("--session", default="linkedin_session.json")
    args = p.parse_args()
    args.limit = max(1, min(args.limit, MAX_LIMIT))
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
