---
name: run-application
description: Starts the JobHunt Coach server on http://localhost:4000 and verifies it is up. Use a background terminal for long-running server processes.
---

# Run Application

Starts and verifies the JobHunt Coach server.

## Steps

1. Make sure the frontend is built first (see `build-project`).
2. Start the server:

   ```bash
   node backend/server.js
   ```

   The server listens on port 4000 by default (override with the `PORT`
   environment variable).

3. Verify it is up:

   ```bash
   curl -s http://localhost:4000/api/jobs | head -c 200
   ```

   A JSON response means the API is live.

## Long-running guidance

The server must keep running to be usable. Use a background terminal (for
example the `background_terminal_create` tool) instead of a blocking foreground
call. Keep the output log path so errors can be inspected later.

## Stopping

Stop the background terminal by its terminal ID. Do not use process-name kill
commands (`pkill`, `killall`).
