# JobHunt Coach - Project Information

A self-hosted job search companion: job application tracker, resume manager with
local AI tailoring, and job discovery via public ATS APIs (Greenhouse, Lever,
and Workday for Fortune 500 employers).

This project is a legitimate alternative to automated application bots. It helps
you organize, tailor, and track applications while you, the human, do the actual
applying.

## Table of contents

1. [What it does](#what-it-does)
2. [How it works](#how-it-works)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Data model](#data-model)
6. [API reference](#api-reference)
7. [Job discovery sources](#job-discovery-sources)
8. [Running the project](#running-the-project)
9. [Project structure](#project-structure)
10. [Key decisions](#key-decisions)
11. [Roadmap](#roadmap)

## What it does

- Pulls live job listings from public ATS APIs: 17 Greenhouse boards, 3 Lever
  boards, and 9 Fortune 500 (Workday) boards.
- Scores each job 0-100 against the skills stored in your profile (local
  keyword overlap, no LLM required).
- Lets you search and filter jobs by keyword, work mode, experience level,
  source, salary bucket, and relevance.
- Tracks a full application pipeline: PENDING, APPLIED, INTERVIEW, OFFER,
  REJECTED, ARCHIVED.
- Manages resumes: upload PDF/DOCX/DOC/TXT/MD, set a baseline, and generate a
  per-job tailored version using a local LLM (Ollama or LM Studio).
- Exports your application history to CSV.
- Sends daily digests to a Discord webhook.
- Stores everything locally in SQLite. No accounts, no cloud, no recurring
  cost.

## How it works

1. You import job boards from the Search & Import tab. The backend calls each
   ATS public API and stores listings in SQLite.
2. A background "enricher" fetches full descriptions for Greenhouse and Workday
   jobs (15 per batch, every 4 seconds) so the search UI has rich content.
3. You fill in your profile (skills). Each job gets a relevance score based on
   keyword overlap with those skills.
4. You upload your resume, set it as the baseline, and optionally generate a
   tailored version per job description via your local LLM. Tailoring only
   reorders/rewords facts already in the resume; it never fabricates experience.
5. When you apply to a job, you record it in the Applications tab. Status moves
   through the pipeline as interviews and offers happen.
6. Export CSV reports or set up a Discord webhook for daily digests.

## Architecture

```
Browser (React SPA)
        |
        | HTTP/JSON  (port 4000)
        v
Express server (backend/server.js)
  |-- REST API (jobs, applications, resumes, profile, settings, logs)
  |-- Static UI serving (public/)
  |-- Importers (backend/scraper.js)
  |     |-- Greenhouse board API
  |     |-- Lever postings API
  |     `-- Workday cxs API + job-page ld+json
  |-- Resume engine (backend/resumeEngine.js)
  |     |-- Text extraction (pdf-parse, mammoth)
  |     `-- Truthful tailoring prompt -> local LLM
  |-- Local AI client (backend/ollama.js) -> Ollama / LM Studio
  |-- Notifier (backend/notifier.js) -> Discord webhook
  `-- SQLite store (backend/database.js) via node:sqlite
```

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 22+ (built-in `node:sqlite`, zero native deps), Express 4 |
| Frontend | React 18 + Vite 5, lucide-react icons |
| Database | SQLite via `node:sqlite` (`backend/data/jobs.db`) |
| Resume parsing | pdf-parse (PDF), mammoth (DOCX), plain text fallback |
| Local AI | Ollama or LM Studio (OpenAI-compatible endpoint) |
| Notifications | Discord webhook |
| Uploads | multer |

## Data model

- `jobs` - imported listings: `external_id`, `source`, `company`, `title`,
  `location`, `url`, `salary`, `description`, `posted_at`, `work_mode`,
  `experience_level`, `relevance`, `skills`, `raw` (JSON)
- `applications` - `job_id`, `resume_id`, `status`, `notes`, `applied_at`,
  `resume_version` (snapshot of the tailored resume)
- `resumes` - `name`, `baseline` flag, `file_path`, `content`
- `settings` - key/value JSON store (LLM host/model, Discord webhook)
- `profile` - candidate name, headline, skills (drives relevance scoring)
- `logs` - backend activity + import/enrichment status

## API reference

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/import` | Import one company board (`source`, `company`, `keyword`) |
| POST | `/api/import/all` | Import all known boards (optional `keyword`) |
| GET | `/api/jobs` | List jobs with filters (`q`, `work_mode`, `experience_level`, `source`, `salary_bucket`, `min_relevance`, `status`) |
| GET | `/api/jobs/:id` | Job detail + its applications |
| PATCH | `/api/jobs/:id` | Update relevance / skills |
| POST | `/api/applications` | Record an application |
| PATCH | `/api/applications/:id` | Update status / notes |
| GET | `/api/applications/export` | Download CSV report |
| POST | `/api/resumes/upload` | Upload a resume (multipart `file`) |
| POST | `/api/resumes/:id/baseline` | Set baseline resume |
| POST | `/api/resumes/:id/tailor` | AI-tailor for a job (`job_id`) |
| GET/PUT | `/api/profile` | Candidate profile |
| GET/PUT | `/api/settings` | LLM + webhook settings |
| POST | `/api/notify/test` | Test Discord webhook |
| POST | `/api/notify/digest` | Send daily digest |
| GET | `/api/logs` | Backend logs |

## Job discovery sources

| Source | API | Boards |
|--------|-----|--------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{company}/jobs` | gitlab, datadog, coinbase, reddit, dropbox, instacart, brex, airtable, stripe, asana, gusto, chime, vercel, brave, sofi, applovin, duolingo |
| Lever | `api.lever.co/v0/postings/{company}?mode=json` | plaid, farfetch, webfx |
| Fortune 500 (Workday) | `{domain}/wday/cxs/{tenant}/{site}/jobs` + job page `application/ld+json` | Bank of America, Target, Amgen, Boeing, Citigroup, Comcast, Micron, Nike, Intel |

Additional company slugs can be added from the UI. Workday listings require a
correct tenant and site pair per company; guessed domains return 422 until the
correct values are supplied.

## Running the project

Prerequisites:

1. Node.js 22+ (uses built-in `node:sqlite`).
2. Optional: Ollama or LM Studio running locally for resume tailoring.
3. Optional: a Discord webhook URL for digests.

Run:

```bash
npm install
npx vite build
node backend/server.js
```

Or run `./start.sh`. Then open `http://localhost:4000`.

## Project structure

```
├── backend/
│   ├── server.js       - Express REST API + static UI server (port 4000)
│   ├── database.js     - SQLite engine (node:sqlite), tables, helpers
│   ├── scraper.js      - Greenhouse/Lever/Workday importers + enrichment
│   ├── ollama.js       - Local AI client (Ollama + LM Studio)
│   ├── resumeEngine.js - Resume text extraction + truthful tailoring
│   └── notifier.js     - Discord digests
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.jsx     - Tab router
│       ├── index.css   - Dark glassmorphism design system
│       └── components/ - Dashboard, Search, Applications, Resumes, Profile, Settings, Logs
├── data/               - SQLite DB + tailored resumes (auto-created)
├── uploads/            - Uploaded resume files
├── public/             - Built UI assets
├── docs/               - Documentation
├── .agent/             - AI agent definitions for building/maintaining the project
├── .skill/             - AI skill definitions for building/maintaining the project
├── vite.config.js
├── package.json
└── start.sh
```

## Key decisions

- No automated application submission. Import only via public ATS APIs. This
  respects the terms of service of job sites and avoids anti-bot violations.
- Resume tailoring is truthful: only reorders/rewords existing facts, never
  fabricates experience.
- Local-first: `node:sqlite` (no native deps), local LLM, zero recurring cost.
- Workday list API requires `limit <= 20`; per-board import caps at 600
  listings. Re-imports upsert via `ON CONFLICT(external_id) DO UPDATE`.
- Descriptions for Greenhouse and Workday are fetched per-job from the job page
  `application/ld+json` (the list API has no descriptions).
- Relevance scoring is local keyword overlap; no LLM required for scoring.

## Roadmap

- Add more engineering-heavy Fortune 500 Workday boards (Apple, Microsoft,
  Verizon, Disney).
- Scheduled daily imports (cron-like).
- Follow-up reminders per application.
- Salary data is sparse across boards; the `$200k+` filter only surfaces
  listings with stated ranges.
