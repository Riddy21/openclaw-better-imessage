#!/bin/zsh
# openclaw-better-imessage — installer
# Usage: ./install.sh +1XXXXXXXXXX
set -e
PHONE="${1:?Usage: ./install.sh +1XXXXXXXXXX (your iMessage number)}"
echo "Installing openclaw-better-imessage for $PHONE ..."

# 1. Patch your phone number into the scripts (default is the author's number)
for f in bin/hal-progress bin/hal-progress-sidecar.js bin/messages-watchdog.sh bin/imsg-autolaunch.sh; do
  [ -f "$f" ] && sed -i '' "s|+12269983286|$PHONE|g" "$f" || true
done

# 2. Install the binaries
sudo cp bin/* /usr/local/bin/
sudo chmod +x /usr/local/bin/hal-progress /usr/local/bin/hal-progress-exec \
  /usr/local/bin/hal-progress-sidecar.js /usr/local/bin/messages-watchdog.sh \
  /usr/local/bin/messages-watchdog-launcher.sh /usr/local/bin/imsg-autolaunch.sh

# 3. Golden self-heal copy (the watchdog launcher restores the active script from this)
sudo cp /usr/local/bin/messages-watchdog.sh /usr/local/bin/messages-watchdog.golden.sh

# 4. Install + (re)load the LaunchAgents
mkdir -p ~/Library/LaunchAgents
cp launchagents/*.plist ~/Library/LaunchAgents/
for p in ai.openclaw.hal-progress ai.openclaw.messages-watchdog ai.openclaw.messages-keepalive ai.openclaw.imsg-launch; do
  launchctl unload ~/Library/LaunchAgents/$p.plist 2>/dev/null || true
  launchctl load   ~/Library/LaunchAgents/$p.plist 2>/dev/null || true
done

echo "✅ openclaw-better-imessage installed and running."
echo "   Progress bubbles, typing indicator, and bridge watchdog are now active."
