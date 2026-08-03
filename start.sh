#!/bin/bash
set -e

# Install dependencies
npm install

# Build the web UI into ./public
npx vite build

# Start the server (serves UI + API on port 4000)
node backend/server.js
