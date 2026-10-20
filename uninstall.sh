#!/bin/zsh
# openclaw-better-imessage — uninstaller
echo "Removing openclaw-better-imessage ..."
for p in ai.openclaw.hal-progress ai.openclaw.messages-watchdog ai.openclaw.messages-keepalive ai.openclaw.imsg-launch; do
  launchctl unload ~/Library/LaunchAgents/$p.plist 2>/dev/null || true
  rm -f ~/Library/LaunchAgents/$p.plist
done
sudo rm -f /usr/local/bin/hal-progress /usr/local/bin/hal-progress-exec \
  /usr/local/bin/hal-progress-sidecar.js /usr/local/bin/messages-watchdog.sh \
  /usr/local/bin/messages-watchdog.golden.sh /usr/local/bin/messages-watchdog-launcher.sh \
  /usr/local/bin/imsg-autolaunch.sh
echo "✅ Uninstalled."
