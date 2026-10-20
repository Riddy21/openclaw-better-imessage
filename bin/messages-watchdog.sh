#!/bin/zsh
# messages-watchdog.sh — DEFINITIVE. Proactive 30s injection per imessage-bridge-watchdog skill.
# DO NOT rewrite to use cooldown or "only when stale" — imsg launch IS a no-op when bridge alive
# (verified by PID test: Messages.app PID unchanged). macOS 15.4 ejects dylib every ~90s.
export PATH="/usr/local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LOG=/tmp/messages-watchdog.log
DB=/Users/hal9000/Library/Messages/chat.db
IMSG=/usr/local/bin/imsg
log() { echo "$(date +%Y-%m-%d" "%H:%M:%S) $*" >> $LOG; }
[[ -f $LOG ]] && tail -300 $LOG > $LOG.tmp && mv $LOG.tmp $LOG

# Start Messages if stopped
if ! pgrep -u hal9000 -x Messages > /dev/null 2>&1; then
  log "Messages not running — launching"
  "$IMSG" launch > /dev/null 2>&1; sleep 5
  nohup "$IMSG" rpc --json --db "$DB" > /tmp/imsg-rpc.log 2>&1 &
  log "Launched (pid=$(pgrep -u hal9000 -x Messages)), RPC: $!"
  exit 0
fi

# Proactive injection (no-op when bridge alive)
"$IMSG" launch > /dev/null 2>&1
osascript -e 'tell application "Messages" to get name' > /dev/null 2>&1

# Ensure RPC running
pgrep -f "imsg rpc" > /dev/null 2>&1 || {
  nohup "$IMSG" rpc --json --db "$DB" > /tmp/imsg-rpc.log 2>&1 &
  log "RPC restarted: $!"
}

# Config validity check (now with node in PATH)
if ! openclaw config validate > /dev/null 2>&1; then
  log "ERROR: openclaw config invalid — channels may be broken"
fi

# Bridge status via JSON
BRIDGE=$("$IMSG" status --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('advanced_features') else 'stale')" 2>/dev/null || echo stale)
if [[ "$BRIDGE" == "stale" ]]; then
  log "Bridge stale — re-injecting"
  "$IMSG" launch > /dev/null 2>&1; sleep 3
else
  log "Messages OK (bridge: ok)"
fi