# AutoApply AI — Open Source Job Automation & Reporting Engine

A **completely free, fully self-hosted** automated job application platform built for **IT Infrastructure**, **Linux Engineering**, **DevOps/SRE**, and **AI/ML Engineering** roles targeting **$200,000+** compensation.

Zero recurring costs. Zero cloud AI subscriptions. Everything runs locally.

---

## 🏛️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│               Web UI Dashboard (Vite + React)                    │
│  - Dashboard & Pipeline │ Search & Filters │ Resume Manager      │
│  - Job Reports │ Profile │ Notifications & Settings │ Logs       │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP / REST API (Port 4000)
┌────────────────────────────▼─────────────────────────────────────┐
│                   Express.js Backend Server                      │
│  - Application Controller  │ SQLite3 Database                    │
│  - Multer Resume Upload     │ CSV / Excel Report Generator       │
└───────┬─────────────────────┬────────────────────┬───────────────┘
        │                     │                    │
┌───────▼───────────┐  ┌──────▼──────────┐  ┌─────▼──────────────┐
│  Job Scraper      │  │ Playwright Bot   │  │ Local Ollama AI     │
│  - Greenhouse API │  │ - Headless Mode  │  │ http://192.168.1.152│
│  - LinkedIn Seeds │  │ - Headed Mode    │  │ :11434  (gemma4)   │
│  - Dice / Monster │  │ - CDP Attach Mode│  │ - Resume Tailoring  │
│  - Lever / Indeed │  │ - Emergency Stop │  │ - Q&A Generation    │
└───────────────────┘  └─────────────────┘  └────────────────────┘
```

---

## 🚀 Quick Start (Mac / Linux)

### Prerequisites
1. **Node.js LTS** — download from [nodejs.org](https://nodejs.org)
2. *(Optional)* **Ollama** running on your local network at `http://192.168.1.152:11434`
   - Or LM Studio at `http://localhost:1234/v1`
3. *(Optional for CDP mode)* **Chrome** launched with remote debugging:
   ```bash
   open -a "Google Chrome" --args --remote-debugging-port=9222
   ```

### Run the App
```bash
cd ~/Desktop/testkuchoo
chmod +x start.sh
./start.sh
```

Then open your browser to **`http://localhost:4000`** 🎉

### Manual Commands
```bash
# Install dependencies
npm install

# Build Web UI
npx vite build --outDir ../public

# Start server (serves UI + API on port 4000)
node backend/server.js
```

---

## 🖥️ Web UI Tabs

| Tab | Purpose |
|-----|---------|
| **Dashboard & Pipeline** | Live stats, bot controls, job queue table |
| **Search & Filters** | Salary buckets, work mode, skills, saved search profiles |
| **Resume Manager & AI Tailor** | Upload resumes, set baseline, AI-tailor per job |
| **Job Reports** | Full application tracking table with CSV export |
| **Profile** | Candidate info, URLs, salary target, cover letter template |
| **Notifications & Settings** | WhatsApp digest, Discord webhook, all settings |
| **Logs** | Real-time activity logs from backend engine |

---

## 🤖 Browser Automation Modes

### 1. Headless Playwright (Default)
- Background invisible Chromium
- Randomized stealth typing delays (30-100ms per char)
- Custom user-agent string
- Automatic CAPTCHA pause & alert

### 2. Headed (Visible Browser)
- Watch the bot fill forms in real-time
- Good for debugging or monitoring

### 3. User Browser Attachment (CDP Mode)
- Attaches to **your already-logged-in Chrome session** via Chrome DevTools Protocol on port 9222
- Bypasses login walls (LinkedIn, Dice, etc.)
- Doesn't close your browser when done
- **To enable:** Launch Chrome with `--remote-debugging-port=9222`, then select CDP mode in Bot Controls

---

## 🛡️ Safety Controls

| Control | Default | Description |
|---------|---------|-------------|
| **Dry Run** | ✅ ON | Forms are filled but NOT submitted. Safe for testing. |
| **Manual Approval** | OFF | Each job requires your click before submitting |
| **Emergency Stop** | Always available | Kills the current bot batch immediately |
| **Company Blacklist** | Empty | Comma-separated companies to skip |

> ⚠️ **Always start in Dry Run mode.** Switch to Live Submit only after verifying the bot fills forms correctly.

---

## 📄 Resume Manager & AI Tailoring

- **Supported Formats:** PDF, DOCX, DOC, TXT, Markdown (`.md`)
- Upload resumes via drag-and-drop in the **Resume Manager** tab
- Set one as your **Baseline** (default for all applications)
- Per-job **Local AI Tailoring:** Ollama reads the job description and rewrites your professional summary & skills specifically for that company — **100% truthful, no fabrication**
- Every application records the **exact resume version submitted**

---

## 💡 Local AI (Ollama) — $0 Cost

The app connects to your local Ollama server at `http://192.168.1.152:11434`.

**Default model:** `gemma4:latest`

**AI-powered features:**
- Resume tailoring per job description
- Cover letter / custom question auto-answers
- Job relevance scoring (0-100)
- WhatsApp daily digest report generation

**LM Studio support:** Switch provider to LM Studio in Bot Controls → uses `http://localhost:1234/v1` (OpenAI-compatible API).

---

## 📊 Excel / CSV Report Export

Click **"Export CSV Report"** in the Job Reports tab to download a spreadsheet containing:
- Job ID, Company, Title, Category, Location
- **Work Mode** (Remote / Hybrid / Onsite)
- **Experience Level** (Junior / Senior / Staff / Principal / Director)
- Salary Target
- Status (APPLIED / PENDING / FAILED)
- Portal Type (LinkedIn, Dice, Monster, Greenhouse, Lever)
- Applied Timestamp
- **Exact Resume Version Submitted** (including AI-tailored variant names)
- Direct Job URL

---

## 📱 WhatsApp Group Digest

In **Notifications & Settings:**
1. Enter your WhatsApp number or group ID
2. Click **"Generate WhatsApp Report"**
3. Ollama generates an emoji-formatted daily pipeline summary
4. Copy/paste to your WhatsApp group (or integrate with CallMeBot API for automated sends)

---

## 🗂️ Project File Structure

```
testkuchoo/
├── backend/
│   ├── server.js          — Express REST API (all /api routes)
│   ├── database.js        — SQLite3 engine (tables, migrations, query helpers)
│   ├── bot.js             — Playwright application bot (Headless / Headed / CDP)
│   ├── scraper.js         — Job discovery (Greenhouse API + seed listings)
│   ├── ollama.js          — LocalAIService (Ollama + LM Studio dual support)
│   ├── resumeEngine.js    — Multi-format resume parser & tailored export writer
│   └── notifier.js        — WhatsApp / Discord notification dispatcher
├── frontend/src/
│   ├── App.jsx            — Main tab router
│   ├── index.css          — Full vanilla CSS design system (dark glassmorphism)
│   └── components/
│       ├── Header.jsx         — Nav tabs + AI status badge + bot state
│       ├── StatsOverview.jsx  — Stats cards grid
│       ├── BotControls.jsx    — Browser mode, safety toggles, AI config
│       ├── SearchFiltersPanel.jsx — Salary buckets, filters, search profiles
│       ├── ResumeManager.jsx  — Upload, baseline, AI tailor studio
│       ├── JobReportsTable.jsx — Application tracking table + CSV export
│       ├── JobDetailModal.jsx — Job detail popup
│       ├── ProfileManager.jsx — Candidate profile editor
│       ├── LogsViewer.jsx     — Real-time backend log viewer
│       └── NotificationsPanel.jsx — WhatsApp/Discord settings
├── data/
│   ├── autoapply.db       — SQLite3 database (auto-created)
│   ├── screenshots/       — Bot screenshot captures per application
│   └── tailored_resumes/  — AI-tailored resume exports per job
├── uploads/               — Uploaded resume files (PDF, DOCX, TXT, etc.)
├── public/                — Built frontend static assets (served by Express)
├── vite.config.js         — Vite build config (root: ./frontend, outDir: ../public)
├── package.json           — npm scripts (start, build, dev)
└── start.sh               — One-command launcher script
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite 8, React 19, Vanilla CSS (Dark Glassmorphism), Lucide Icons |
| **Backend** | Node.js, Express 5, SQLite3 |
| **Automation** | Playwright (Chromium) — Headless, Headed, CDP attach |
| **Resume Parsing** | Node.js `fs` (TXT/MD native), binary regex for PDF/DOCX |
| **Local AI** | Ollama REST API (`http://192.168.1.152:11434`) or LM Studio |
| **File Upload** | Multer (PDF, DOCX, DOC, TXT, MD) |

---

## ⚙️ Environment Variables (optional `.env`)

```bash
PORT=4000
OLLAMA_HOST=http://192.168.1.152:11434
OLLAMA_MODEL=gemma4:latest
LMSTUDIO_HOST=http://localhost:1234/v1
```

---

## 📋 Known Limitations

- **CAPTCHA:** If a job portal shows a CAPTCHA, the bot automatically pauses and logs a warning. Manual intervention required.
- **LinkedIn:** LinkedIn Easy Apply automation works best in CDP mode (using your logged-in session).
- **Resume PDF parsing:** Binary PDF text extraction is best-effort. For ideal AI tailoring, upload a plain `.txt` or `.md` version of your resume alongside the PDF.

---

## 📜 License

100% Free & Open Source — MIT License
