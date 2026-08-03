---
name: setup-environment
description: Installs all dependencies and prerequisites for JobHunt Coach on a fresh machine. Run once before building or running.
---

# Setup Environment

Prepares a machine to build and run JobHunt Coach.

## Prerequisites

- Node.js 22+ (uses built-in `node:sqlite`, no native compile needed)
- Git (to clone the repository)

## Steps

1. Check Node version:

   ```bash
   node -v
   ```

   If the version is below 22, install the LTS release from
   https://nodejs.org first.

2. Install dependencies:

   ```bash
   npm install
   ```

   This downloads Express, React, Vite, and the resume parsing libraries.

3. Verify install: `npm ls express react` lists the packages without errors.

## Optional

- Ollama (https://ollama.com) or LM Studio for local AI resume tailoring.
- A Discord webhook URL for daily digests (set later in the app UI).
