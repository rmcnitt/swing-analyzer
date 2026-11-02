#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${TMPDIR:-/tmp}/swing-analyzer-npm-cache"

cd "$ROOT_DIR"

mkdir -p "$CACHE_DIR"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies with local npm cache..."
  npm_config_cache="$CACHE_DIR" npm install
fi

if [ ! -f ".env.local" ] && [ -f ".env.example" ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example"
fi

echo "Starting Swing Analyzer at http://localhost:3000"
exec env npm_config_cache="$CACHE_DIR" npm run dev
