# JobHunt Coach

A self-hosted job search companion: a **job application tracker**, **resume manager with local AI tailoring**, and **job discovery via public ATS APIs** (Greenhouse & Lever boards).

Built as a legitimate alternative to automated application bots — it helps you organize, tailor, and track your applications, while **you** do the actual applying.

---

## Why this version

Your original README described an automated "auto-apply" Playwright bot that submits applications across LinkedIn, Indeed, Dice, etc. Mass automated submission bypasses those sites' anti-bot protections and violates their Terms of Service, so it is **not included**. This version keeps the genuinely useful parts:

- Job discovery through **official public APIs** (Greenhouse boards API, Lever postings API) — no scraping of protected sites
- A **tracker / pipeline** for every job you choose to apply to
- **Resume management + AI tailoring** that only reorders and rewords facts already in your resume — it never fabricates experience
- **Reports & digests** (CSV export, Discord digests)

---

## Features

| Feature | Description |
|---------|-------------|
| Job import | Pulls live listings from 17 Greenhouse boards, 3 Lever boards, and 9 Fortune 500 (Workday) boards via their public APIs; add any company slug manually |
| Relevance scoring | Scores each job 0–100 against the skills in your profile |
| Search & filters | Keyword, work mode, experience level, source, salary bucket ($100k/$150k/$200k+), minimum match % |
| Pipeline tracking | PENDING → APPLIED → INTERVIEW → OFFER → REJECTED → ARCHIVED |
| Resume manager | Upload PDF/DOCX/DOC/TXT/MD; set a baseline; generate a per-job tailored version with your local LLM |
| CSV export | One-click spreadsheet of all applications with the exact resume version used |
| Discord digests | Daily summary via a webhook you create |
| Local AI | Ollama or LM Studio — the model runs on your own machine, $0 cost |

---

## Quick start (Mac / Linux)

### Prerequisites
1. Node.js 22+ (uses built-in `node:sqlite`, no native compile needed)
2. Optional: Ollama or LM Studio running locally for resume tailoring
3. Optional: a Discord webhook URL for digests

### Run
```bash
npm install
npx vite build
node backend/server.js
```

Or simply `./start.sh`. Then open `http://localhost:4000`.

### Manual commands
```bash
npm install          # install dependencies
npx vite build       # build UI into ./public
node backend/server.js
```

---

## Web UI tabs

| Tab | Purpose |
|-----|---------|
| Dashboard | Stats, pipeline summary, recent applications |
| Search & Import | Import boards, filter/sort jobs, open job details |
| Applications | Full application table, status updates, CSV export |
| Resume Manager | Upload resumes, set baseline, AI-tailor per job |
| Profile | Candidate info + skills (drives relevance scoring) |
| Notifications & Settings | LLM provider config, Discord webhook |
| Logs | Backend activity + import/enrichment status |

---

## Job discovery sources

| Source | API | Boards |
|--------|-----|--------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{company}/jobs` | gitlab, datadog, coinbase, reddit, dropbox, instacart, brex, airtable, stripe, asana, gusto, chime, vercel, brave, sofi, applovin, duolingo |
| Lever | `api.lever.co/v0/postings/{company}?mode=json` | plaid, farfetch, webfx |
| Fortune 500 (Workday) | `{domain}/wday/cxs/{tenant}/{site}/jobs` + job page `application/ld+json` | Bank of America, Target, Amgen, Boeing, Citigroup, Comcast, Micron, Nike, Intel |

Add any company board slug in the UI (e.g. `datadog`, `farfetch`, `bankofamerica`, `intel`). Invalid slugs are skipped and logged.

Descriptions for Greenhouse and Workday jobs are fetched in the background (15 per batch) so imports stay fast; watch the Logs tab for progress.

---

## Local AI (Ollama / LM Studio)

Configured in **Notifications & Settings**:

- **Ollama**: host `http://192.168.1.152:11434`, model e.g. `gemma4:latest`
- **LM Studio**: host `http://localhost:1234/v1` (OpenAI-compatible)

Used for:
- Resume tailoring per job description (summary + skills, truthful only)
- Relevance scoring runs locally (keyword overlap — no LLM needed)

If the model is unreachable, tailoring returns a clear error and the rest of the app keeps working.

---

## API overview

| Route | Description |
|-------|-------------|
| `POST /api/import` | Import one company board (`source`, `company`, `keyword`) |
| `POST /api/import/all` | Import all known boards (optional `keyword`) |
| `GET /api/jobs` | List jobs with filters (`q`, `work_mode`, `experience_level`, `source`, `salary_bucket`, `min_relevance`, `status`) |
| `GET /api/jobs/:id` | Job detail + its applications |
| `PATCH /api/jobs/:id` | Update relevance / skills |
| `POST /api/applications` | Record an application |
| `PATCH /api/applications/:id` | Update status / notes |
| `GET /api/applications/export` | Download CSV report |
| `POST /api/resumes/upload` | Upload a resume (multipart `file`) |
| `POST /api/resumes/:id/baseline` | Set baseline resume |
| `POST /api/resumes/:id/tailor` | AI-tailor for a job (`job_id`) |
| `GET/PUT /api/profile` | Candidate profile |
| `GET/PUT /api/settings` | LLM + webhook settings |
| `POST /api/notify/test` `POST /api/notify/digest` | Discord notifications |
| `GET /api/logs` | Backend logs |

---

## Project structure

```
├── backend/
│   ├── server.js       — Express REST API + static UI server (port 4000)
│   ├── database.js     — SQLite engine (node:sqlite), tables, helpers
│   ├── scraper.js      — Greenhouse/Lever board import + background enrichment
│   ├── ollama.js       — Local AI client (Ollama + LM Studio)
│   ├── resumeEngine.js — Resume text extraction + truthful tailoring
│   └── notifier.js     — Discord digests
├── frontend/
│   ├── index.html
│   └── src/
│       ├── App.jsx     — Tab router
│       ├── index.css   — Dark glassmorphism design system
│       └── components/ — Dashboard, Search, Applications, Resumes, Profile, Settings, Logs
├── data/               — SQLite DB + tailored resumes (auto-created)
├── uploads/            — Uploaded resume files
├── public/             — Built UI assets
├── vite.config.js
├── package.json
└── start.sh
```

---

## Environment variables (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `4000` | HTTP port |
| `OLLAMA_HOST` | — | Fallback hint; LLM host is set in the UI |
| `OLLAMA_MODEL` | — | Fallback hint; model is set in the UI |

---

## License

MIT
