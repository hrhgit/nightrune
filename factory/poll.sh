#!/bin/zsh -l
# One factory poll, run by launchd every 10 minutes (see install-poller.sh).
# Runs from its own worktree at origin/main, so the person's checkout is never touched.
set -eu
R="$HOME/.nightrune-factory/runner"
REPO="${NIGHTRUNE_REPO:?set by the launchd job}"
if [ ! -d "$R" ]; then git -C "$REPO" worktree add -q --detach "$R" origin/main; fi
cd "$R"
git fetch -q origin main
git checkout -q --detach origin/main
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm ci --no-audit --no-fund -s; fi
exec npm run -s factory
