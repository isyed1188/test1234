---
name: verify-project
description: Runs the full verification pass on JobHunt Coach: install, build, server start, API smoke tests, and core user flows.
---

# Verify Project

End-to-end verification of JobHunt Coach before shipping changes.

## Automated checks

```bash
npm install
npx vite build
node backend/server.js &
curl -s http://localhost:4000/api/jobs | head -c 200
curl -s -X POST http://localhost:4000/api/import \
  -H "Content-Type: application/json" \
  -d '{"source":"greenhouse","company":"datadog","keyword":"engineer"}'
curl -s http://localhost:4000/api/logs | head -c 200
```

## Manual user-flow checks (browser at http://localhost:4000)

- Profile tab: save skills, confirm jobs show relevance scores.
- Search & Import: import from Greenhouse, Lever, and one Fortune 500 Workday
  board; open a job detail modal.
- Applications: save a job, move it through statuses, export CSV.
- Resume Manager: upload a resume, set baseline.
- Notifications & Settings: save LLM host/model and a Discord webhook, send a
  test notification.

## Report

List each check as pass/fail with the command/output used. Never change code to
force a check to pass; report failures for the responsible agent.
