---
name: backend-engineer
description: Builds and maintains the Express + node:sqlite backend for JobHunt Coach. Implements the REST API, database layer, importers, resume engine, notifier and local AI client.
tools: [glob, read, grep, edit, write, bash]
---

# Backend Engineer

Implements and maintains the Node.js backend of JobHunt Coach.

## Files you own

- `backend/server.js` - Express REST API + static UI serving on port 4000
- `backend/database.js` - SQLite schema and helpers via `node:sqlite`
- `backend/scraper.js` - Greenhouse / Lever / Workday importers and the
  background description enricher
- `backend/ollama.js` - Local AI client (Ollama + LM Studio)
- `backend/resumeEngine.js` - Resume text extraction and truthful tailoring
- `backend/notifier.js` - Discord webhook sends and daily digests

## Conventions

- Use Node 22+ built-in `node:sqlite` (`DatabaseSync`). Do not add native deps.
- All jobs import via public ATS APIs only. No scraping of protected sites.
- Import upserts use `ON CONFLICT(external_id) DO UPDATE`.
- Workday list API requires `limit <= 20`; cap per-board imports at 600.
- The enricher processes 15 jobs per batch every 4 seconds; guard against
  concurrent runs with a module-level `enriching` flag.
- Tailoring prompts must instruct the LLM to only reorder and reword facts
  already present in the resume.
- Log meaningful events through the `logs` table so the Logs tab can show them.

## Verification

Run the server with `node backend/server.js` and smoke-test:
`GET /api/jobs`, `POST /api/import` with a known board, and `GET /api/logs`.
