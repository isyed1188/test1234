#!/bin/bash
set -e

# JobHunt Coach needs node:sqlite (Node 22.9+)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 9 ]; }; then
  echo "Node 22.9 or newer is required (found $(node -v))." >&2
  exit 1
fi

# Install dependencies
npm install

# Build the web UI into ./public
npx vite build

# Start the server (serves UI + API on $PORT, default 4000)
npm start
