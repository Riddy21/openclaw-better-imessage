#!/bin/zsh
# Safe watchdog: only re-inject when bridge CONFIRMED stale. Never proactive.
# imsg launch RESTARTS Messages.app - call only when bridge is confirmed dead.
LOG=/tmp/messages-watchdog.log
INJECT_AT=/tmp/messages-watchdog-injected-at
DB=/Users/hal9000/Library/Messages/chat.db
IMSG=/usr/local/bin/imsg
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> $LOG; }
[[ -f $LOG ]] && tail -200 $LOG > $LOG.tmp && mv $LOG.tmp $LOG

if ! pgrep -u hal9000 -x Messages > /dev/null 2>&1; then
  log "Messages not running - launching"
  $IMSG launch >> $LOG 2>&1; date +%s > $INJECT_AT; sleep 5
  nohup $IMSG rpc --json --db $DB > /tmp/imsg-rpc.log 2>&1 &
  log "Launched RPC: $!"; exit 0
fi

NOW=$(date +%s)
LAST=$(cat $INJECT_AT 2>/dev/null || echo 0)
CAGE=$(( NOW - LAST ))
if [[ $CAGE -gt 120 ]]; then
  ST=$($IMSG status 2>&1)
  if echo "$ST" | grep -qE "not responding|Unavailable"; then
    log "Bridge stale - re-injecting"
    $IMSG launch >> $LOG 2>&1; date +%s > $INJECT_AT; sleep 5; log "Re-injected"
  else
    log "Messages OK"
  fi
else
  log "Messages OK (cooldown $CAGE s)"
fi

pgrep -f "imsg rpc" > /dev/null 2>&1 || {
  nohup $IMSG rpc --json --db $DB > /tmp/imsg-rpc.log 2>&1 &
  log "RPC restarted: $!"
}
