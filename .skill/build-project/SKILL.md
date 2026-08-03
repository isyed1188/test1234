---
name: build-project
description: Builds JobHunt Coach from source: compiles the frontend with Vite into ./public ready for the Express server to serve.
---

# Build Project

Compiles the React frontend into static assets served by the backend.

## Steps

1. Ensure dependencies are installed (see `setup-environment`).
2. Build the frontend:

   ```bash
   npx vite build
   ```

3. Confirm output: the `public/` folder is created/updated with the built UI
   assets.
4. Optional full clean run:

   ```bash
   ./start.sh
   ```

   which runs `npm install`, `npx vite build`, then starts the server.

## Verification

The build must finish without errors and produce `public/index.html` plus
bundled assets in `public/assets/`.
