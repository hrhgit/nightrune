#!/bin/zsh
# Installs (or with --remove, removes) the launchd job that runs factory/poll.sh every 10 minutes.
set -eu
LABEL=dev.nightrune.factory
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"; echo "removed $LABEL"; exit 0
fi
REPO="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.nightrune-factory" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$REPO/factory/poll.sh</string></array>
  <key>EnvironmentVariables</key><dict><key>NIGHTRUNE_REPO</key><string>$REPO</string></dict>
  <key>StartInterval</key><integer>600</integer>
  <key>StandardOutPath</key><string>$HOME/.nightrune-factory/poll.log</string>
  <key>StandardErrorPath</key><string>$HOME/.nightrune-factory/poll.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL: every 10 minutes; log $HOME/.nightrune-factory/poll.log; remove with: factory/install-poller.sh --remove"
