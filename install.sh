#!/bin/zsh
# hal-progress installer
set -e
PHONE="${1:?Phone number required (e.g. +12345678900)}"
echo "Installing hal-progress for $PHONE..."
sed -i '' "s|+12269983286|$PHONE|g" bin/hal-progress bin/hal-progress-sidecar.js bin/messages-watchdog.sh
sudo cp bin/hal-progress bin/hal-progress-sidecar.js bin/hal-progress-exec bin/messages-watchdog.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/hal-progress /usr/local/bin/hal-progress-exec /usr/local/bin/messages-watchdog.sh
cp launchagent/ai.openclaw.hal-progress.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/ai.openclaw.hal-progress.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/ai.openclaw.hal-progress.plist
echo "✅ hal-progress installed and running!"
