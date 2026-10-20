#!/bin/zsh
# imessage-stress-test.sh — 2-hour continuous health + feature test
# Checks every 2min: bridge, config, RPC, Messages, hal-progress bubble flow.
# Logs pass/fail. Tests "after pause" by varying intervals.
LOG=/tmp/imessage-stress-test.log
IMSG=/usr/local/bin/imsg
PHONE="+12269983286"
DB=/Users/hal9000/Library/Messages/chat.db
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

END=$(( $(date +%s) + 7200 ))  # 2 hours
PASS=0; FAIL=0; CYCLE=0

log() { echo "$(date '+%H:%M:%S') $*" >> $LOG; }
log "=== STRESS TEST START (2h) ==="

while [[ $(date +%s) -lt $END ]]; do
  CYCLE=$(( CYCLE + 1 ))
  ISSUES=""

  # 1. Bridge
  BRIDGE=$($IMSG status --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('advanced_features') else 'STALE')" 2>/dev/null || echo FAIL)
  [[ $BRIDGE != ok ]] && ISSUES="$ISSUES bridge=$BRIDGE"

  # 2. Config
  openclaw config validate >/dev/null 2>&1 || ISSUES="$ISSUES config=INVALID"

  # 3. RPC
  pgrep -f "imsg rpc" >/dev/null 2>&1 || ISSUES="$ISSUES rpc=DOWN"

  # 4. Messages.app
  pgrep -x Messages >/dev/null 2>&1 || ISSUES="$ISSUES messages=DOWN"

  # 5. Typing works
  TYPE=$($IMSG typing --to "$PHONE" --duration 1s --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','fail'))" 2>/dev/null || echo FAIL)
  [[ $TYPE != completed ]] && ISSUES="$ISSUES typing=$TYPE"

  # 6. Send path (every 10th cycle to avoid spam)
  if (( CYCLE % 10 == 0 )); then
    $IMSG send --to "$PHONE" --text "🔬 stress test cycle $CYCLE — all systems check" >/dev/null 2>&1 && SEND=ok || SEND=FAIL
    [[ $SEND != ok ]] && ISSUES="$ISSUES send=$SEND"
  fi

  if [[ -z $ISSUES ]]; then
    PASS=$(( PASS + 1 ))
    log "cycle $CYCLE ✅ PASS (bridge=$BRIDGE typing=$TYPE) [pass=$PASS fail=$FAIL]"
  else
    FAIL=$(( FAIL + 1 ))
    log "cycle $CYCLE ❌ FAIL:$ISSUES [pass=$PASS fail=$FAIL]"
    # Self-heal attempt
    $IMSG launch >/dev/null 2>&1
  fi

  # Vary sleep to simulate pauses: mostly 2min, occasionally longer
  if (( CYCLE % 7 == 0 )); then
    log "cycle $CYCLE — simulating 8min pause"
    sleep 480
  else
    sleep 120
  fi
done

log "=== STRESS TEST DONE: $PASS passed, $FAIL failed over $CYCLE cycles ==="
# Final report to iMessage
$IMSG send --to "$PHONE" --text "🔬 2h stress test complete: $PASS passed / $FAIL failed over $CYCLE cycles. Full log: /tmp/imessage-stress-test.log" >/dev/null 2>&1
