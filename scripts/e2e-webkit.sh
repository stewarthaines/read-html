#!/bin/sh
# Runs the Playwright suite on WebKit inside the CI-matching Linux image.
# Playwright ≥1.58 ships no WebKit build for macOS 13, so this machine cannot
# run WebKit natively; CI's image is the WebKit authority and this script
# reproduces it exactly. Requires Docker.
# Extra args are passed to `playwright test` (e.g. a single spec file).
set -eu

PLAYWRIGHT_VERSION=$(node -p "require('@playwright/test/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

# The repo is copied inside the container so the host node_modules (macOS
# binaries) are never touched.
docker run --rm --ipc=host -v "$PWD":/repo "$IMAGE" sh -c '
  set -eu
  cp -r /repo /work && cd /work
  rm -rf node_modules test-results playwright-report
  npm ci
  CI=1 npx playwright test --project=webkit "$@"
' sh "$@"
