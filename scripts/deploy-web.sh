#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/build-web.sh"
cd "$ROOT/src/web"
exec npx wrangler pages deploy ../dist --project-name saicommons-web "$@"
