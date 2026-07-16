#!/bin/sh
# Regenerates Playwright visual-snapshot baselines inside the CI-matching
# Linux environment (docs/BOOTSTRAP.md §0): font rendering differs across
# platforms, so baselines captured natively on macOS would fail forever on
# Linux CI. Review the resulting PNGs, then commit them. Requires Docker.
set -eu

PLAYWRIGHT_VERSION=$(node -p "require('@playwright/test/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

# The repo is copied inside the container so the host node_modules (macOS
# binaries) are never touched; only the regenerated snapshots are copied back.
docker run --rm --ipc=host -v "$PWD":/repo "$IMAGE" sh -c '
  set -eu
  cp -r /repo /work && cd /work
  rm -rf node_modules test-results playwright-report
  npm ci
  CI=1 npx playwright test --update-snapshots
  mkdir -p /repo/e2e/__snapshots__
  cp -r /work/e2e/__snapshots__/. /repo/e2e/__snapshots__/
'

echo 'Snapshot baselines updated in e2e/__snapshots__/ — review the PNGs and commit them.'
