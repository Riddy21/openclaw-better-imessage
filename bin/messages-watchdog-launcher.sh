#!/bin/zsh
# messages-watchdog-launcher.sh — self-heals the watchdog from golden copy, then runs it.
# This is what the LaunchAgent calls. Keeps the watchdog tamper-resistant.
GOLDEN=/usr/local/bin/messages-watchdog.golden.sh
ACTIVE=/usr/local/bin/messages-watchdog.sh
LOG=/tmp/messages-watchdog.log
# If active differs from golden, a session corrupted it — restore
if ! cmp -s "$GOLDEN" "$ACTIVE"; then
  cp "$GOLDEN" "$ACTIVE"
  chmod +x "$ACTIVE"
  echo "$(date +%Y-%m-%d\ %H:%M:%S) SELF-HEAL: watchdog restored from golden copy" >> $LOG
fi
exec /bin/zsh "$ACTIVE"