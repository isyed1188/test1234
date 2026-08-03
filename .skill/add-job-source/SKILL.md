---
name: add-job-source
description: Adds a new company job board to JobHunt Coach via its public ATS API (Greenhouse, Lever, or Workday). Update scraper.js and test the import.
---

# Add Job Source

Adds a new company board to the job discovery sources in `backend/scraper.js`.

## Determine the ATS type

- **Greenhouse** boards: URL contains `boards.greenhouse.io/{company}`. Add the
  slug to `GREENHOUSE_SOURCES`.
- **Lever** boards: URL contains `jobs.lever.co/{company}`. Add the slug to
  `LEVER_SOURCES`.
- **Workday** (used by many Fortune 500 companies): needs `{ domain, tenant,
  site }`. Add the entry to `WORKDAY_SOURCES`.

## Workday specifics

List API:

```bash
curl -s -X POST "https://{domain}/wday/cxs/{tenant}/{site}/jobs" \
  -H "Content-Type: application/json" \
  -d '{"appliedFacets":{},"limit":20,"offset":0}'
```

- `limit` must be 20 or lower, otherwise the API returns HTTP 400.
- The list API has no descriptions; fetch each job page's embedded
  `application/ld+json` for the description.
- The job page URL is `https://{domain}/en-US/{site}{externalPath}`.
- Wrong tenant/site returns 422. Skip and log such boards instead of failing
  the whole import.

## Test

Import the new board with keyword `engineer` and confirm a non-zero count via
`GET /api/jobs`. Re-import to confirm upserts (no duplicates).
