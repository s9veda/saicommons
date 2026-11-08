#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)/../.."
WEB_DIR="$REPO_ROOT/src/web"
VARS_FILE="$REPO_ROOT/.dev.vars"
PAGES_PROJECT_NAME="saicommons-web"   # change if your Pages project has a different name

if [[ ! -f "$VARS_FILE" ]]; then
  echo "❌ .dev.vars not found at $VARS_FILE"
  exit 1
fi

cd "$WEB_DIR"

echo "Installing web dependencies..."
npm install

echo "Reading secrets from $VARS_FILE and uploading to Cloudflare Pages project '$PAGES_PROJECT_NAME'..."

# Read .dev.vars line by line
while IFS='=' read -r KEY VALUE; do
  # Skip empty lines and comments
  if [[ -z "$KEY" ]] || [[ "$KEY" =~ ^[[:space:]]*# ]]; then
    continue
  fi

  # Trim whitespace
  KEY="$(echo "$KEY" | xargs)"
  VALUE="$(echo "$VALUE" | xargs)"

  if [[ -z "$KEY" ]]; then
    continue
  fi

  echo "Putting secret: $KEY"
  # For Pages, you must specify the project name
  printf '%s' "$VALUE" | npx wrangler pages secret put "$KEY" --project-name "$PAGES_PROJECT_NAME"
done < "$VARS_FILE"

echo "Building web (Expo export for web)..."
npm run build-web

echo "Deploying web to Cloudflare Pages..."
# If you’re using CLI deploys, this assumes you have wrangler.jsonc
# at the repo root with pages_build_output_dir = "./src/web/dist"
cd "$REPO_ROOT"
npx wrangler pages deploy src/web/dist --project-name "$PAGES_PROJECT_NAME"

echo "✅ Web secrets updated and site deployed."

