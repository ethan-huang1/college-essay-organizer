#!/usr/bin/env bash
set -euo pipefail

npm run lint
npm run typecheck
npm run build
bash scripts/test_overnight_handoff.sh
