#!/bin/bash
# Auto-injects the imsg private API bridge into Messages.app at login.
# Only injects if not already active — avoids restarting Messages needlessly.

LOG=/tmp/imsg-autolaunch.log
echo "[$(date)] imsg-autolaunch starting" >> "$LOG"

# Wait for openclaw gateway to be up (up to 60s)
for i in $(seq 1 60); do
    if openclaw gateway status 2>/dev/null | grep -q "running\|connected"; then
        echo "[$(date)] Gateway is up (attempt $i)" >> "$LOG"
        break
    fi
    sleep 1
done

# Open Messages if not already running
open -a Messages

# Wait up to 30s for Messages.app to be running
for i in $(seq 1 30); do
    if pgrep -x Messages > /dev/null 2>&1; then
        echo "[$(date)] Messages.app is running (attempt $i)" >> "$LOG"
        break
    fi
    sleep 1
done

# Give it a few more seconds to fully initialise
sleep 5

# Check if bridge already active — skip launch if so (avoids restarting Messages.app)
ADVANCED=$(/usr/local/bin/imsg status --json 2>/dev/null | python3 -c "import sys,json; s=json.load(sys.stdin); print(s.get('advanced_features', False))" 2>/dev/null)
if [ "$ADVANCED" = "True" ]; then
    echo "[$(date)] Bridge already active, skipping imsg launch" >> "$LOG"
    exit 0
fi

# Inject the bridge
echo "[$(date)] Running imsg launch..." >> "$LOG"
IMSG_LAUNCH_READY_TIMEOUT=30 /usr/local/bin/imsg launch >> "$LOG" 2>&1
echo "[$(date)] imsg launch exited with code $?" >> "$LOG"
