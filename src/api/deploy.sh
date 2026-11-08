#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)/../.."
API_DIR="$REPO_ROOT/src/api"
VARS_FILE="$REPO_ROOT/.dev.vars"

if [[ ! -f "$VARS_FILE" ]]; then
  echo "❌ .dev.vars not found at $VARS_FILE"
  exit 1
fi

cd "$API_DIR"

echo "Installing API dependencies..."
npm install

echo "Reading secrets from $VARS_FILE and uploading to Cloudflare Workers..."

# Read .dev.vars line by line
while IFS='=' read -r KEY VALUE; do
  # Skip empty lines and comments
  if [[ -z "$KEY" ]] || [[ "$KEY" =~ ^[[:space:]]*# ]]; then
    continue
  fi

  # Trim whitespace around KEY and VALUE
  KEY="$(echo "$KEY" | xargs)"
  VALUE="$(echo "$VALUE" | xargs)"

  if [[ -z "$KEY" ]]; then
    continue
  fi

  echo "Putting secret: $KEY and $VALUE"
  # Pass value via stdin to avoid interactive prompt
  printf '%s' "$VALUE" | npx wrangler secret put "$KEY"
done < "$VARS_FILE"

# If you have a build step, uncomment:
# echo "Building API..."
# npm run build

echo "Deploying API to Cloudflare Workers..."
npx wrangler deploy

echo "✅ API secrets updated and API deployed."
