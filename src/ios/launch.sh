#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)/../.."
WEB_DIR="$REPO_ROOT/src/web"
VARS_FILE="$REPO_ROOT/.dev.vars"

if [[ ! -f "$VARS_FILE" ]]; then
  echo "❌ .dev.vars not found at $VARS_FILE"
  exit 1
fi

cd "$REPO_ROOT"

echo "Installing all dependencies (including workspace packages)..."
npm install

echo "Reading environment variables from $VARS_FILE..."

# Export environment variables from .dev.vars
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

  echo "Setting: $KEY"
  export "$KEY=$VALUE"
done < "$VARS_FILE"

cd "$WEB_DIR"

echo "Starting Expo iOS development server..."
exec npm run ios