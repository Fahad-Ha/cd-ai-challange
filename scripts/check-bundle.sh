#!/usr/bin/env sh
# Tampering attack 5: the AI key must never reach the client bundle.
# Run after `npm run build`. Exits 1 if any static file mentions the key.
set -eu
[ -d .next/static ] || { echo "no .next/static — run npm run build first"; exit 2; }
needles='sk-or-\|OPENROUTER_API_KEY'
if [ -n "${OPENROUTER_API_KEY:-}" ]; then needles="$needles\|$OPENROUTER_API_KEY"; fi
if grep -rl "$needles" .next/static; then
  echo "KEY FOUND IN BUNDLE"; exit 1
fi
echo "bundle clean: no API key material in .next/static"
