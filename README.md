# openclaw-better-imessage

Rich live-progress iMessage bubbles for [OpenClaw](https://openclaw.ai) agents — typing indicators, edit-in-place status, and a self-healing bridge stack.

## What it looks like

Every iMessage task shows as a **single bubble that edits in place** as work progresses. The header stays fixed; the status line replaces each update:

```
⏳ Checking PR #361 CI failures
```
→ edits to:
```
⏳ Checking PR #361 CI failures

(⚙️ exec): gh run view 39348281 --log-failed
```
→ edits to:
```
⏳ Checking PR #361 CI failures

(🔍 found): removed_at column missing from test schema
```
→ edits to:
```
⏳ Checking PR #361 CI failures

(🤔 thinking): cherry-picking migration fix to PR branch
```
→ resolves to:
```
⏳ Checking PR #361 CI failures

✅ Done · 47s
```

The bubble is marked **Edited** in iMessage, so you can always see it changed. When a new sub-task starts, a new bubble opens with a fresh header. Native **typing indicator** fires the instant your message lands (via chat.db polling — no delay).

---

## Status label format

| Label | Prefix | Meaning |
|---|---|---|
| exec | `(⚙️ exec):` | Running a shell command |
| found | `(🔍 found):` | Showing a discovery or output |
| thinking | `(🤔 thinking):` | Agent reasoning step |
| done | `(✅ done):` / `✅ Done · Xs` | Task complete |
| error | `(❌ error):` | Something failed |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenClaw Gateway                                               │
│                                                                 │
│  ┌─────────────────────────┐   fires on message:received       │
│  │  imessage-progress hook │ ─────────────────────────────┐    │
│  └─────────────────────────┘                               │    │
└────────────────────────────────────────────────────────────│────┘
                                                             │
┌────────────────────────────────────────────────────────────▼────┐
│  LaunchAgents (persist across sessions, restarts, /new)         │
│                                                                 │
│  hal-progress-sidecar (v10)          messages-watchdog          │
│  ├─ polls chat.db every 400ms        ├─ proactive imsg launch   │
│  ├─ instant typing on inbound        │   every 30s (no-op when  │
│  └─ end-of-turn ✅ Done · Xs summary │   bridge alive)          │
│                                      └─ self-heals from golden  │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  /usr/local/bin/hal-progress (v10)                              │
│                                                                 │
│  hal-progress start "Task title"        → opens bubble, GUID   │
│  hal-progress update GUID exec "cmd"    → (⚙️ exec): cmd       │
│  hal-progress update GUID found "msg"   → (🔍 found): msg      │
│  hal-progress update GUID thinking "…"  → (🤔 thinking): …     │
│  hal-progress run GUID "shell command"  → auto exec + found    │
│  hal-progress done GUID "✅ summary"    → final edit           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- macOS 14+ (tested on macOS 15.4.1)
- [OpenClaw](https://openclaw.ai) running as a Gateway
- [imsg](https://imsg.dev) v0.17.0+ with Private API enabled  
  (`imsg status` should show `Available - IMCore bridge connected`)
- SIP disabled (required for IMCore bridge injection)
- `sqlite3` in PATH

---

## Installation

```bash
git clone https://github.com/Riddy21/openclaw-better-imessage.git
cd openclaw-better-imessage
```

### 1. Copy scripts

```bash
cp scripts/imessage/hal-progress /usr/local/bin/hal-progress
cp scripts/imessage/hal-progress-exec /usr/local/bin/hal-progress-exec
cp scripts/imessage/hal-progress-sidecar.js /usr/local/bin/hal-progress-sidecar.js
cp scripts/imessage/hal-progress-sidecar.js /usr/local/bin/hal-progress-sidecar.golden.js
cp scripts/imessage/messages-watchdog.sh /usr/local/bin/messages-watchdog.sh
cp scripts/imessage/messages-watchdog.sh /usr/local/bin/messages-watchdog.golden.sh
cp scripts/imessage/messages-watchdog-launcher.sh /usr/local/bin/messages-watchdog-launcher.sh
chmod +x /usr/local/bin/hal-progress /usr/local/bin/hal-progress-exec /usr/local/bin/messages-watchdog*.sh
```

### 2. Edit phone number

Edit `/usr/local/bin/hal-progress` and `/usr/local/bin/hal-progress-sidecar.js` — replace `+12269983286` with your phone number.

### 3. Load the LaunchAgents

**Watchdog** (keeps IMCore bridge alive every 30s):

```xml
<!-- ~/Library/LaunchAgents/ai.openclaw.messages-watchdog.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>ai.openclaw.messages-watchdog</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>/usr/local/bin/messages-watchdog-launcher.sh</string>
    </array>
    <key>StartInterval</key><integer>30</integer>
    <key>RunAtLoad</key><true/>
</dict>
</plist>
```

**Sidecar** (typing indicator + end-of-turn summary):

```xml
<!-- ~/Library/LaunchAgents/ai.openclaw.hal-progress.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>ai.openclaw.hal-progress</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/bin/hal-progress-sidecar.js</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/ai.openclaw.messages-watchdog.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.hal-progress.plist
```

### 4. OpenClaw hook (⚠️ disabled by default)

> **The `imessage-progress` hook is disabled by default.** When enabled, it fires on every inbound iMessage and auto-creates an "⏳ On it…" bubble. If the agent errors before replying (e.g. due to context bloat), you end up with a pile of unresolved bubbles and no actual responses. Keep it disabled and let the agent drive bubbles manually via `hal-progress start`.

If you want to experiment with it anyway:

```bash
mkdir -p ~/.openclaw/hooks/imessage-progress
cp scripts/imessage/hooks/imessage-progress/HOOK.md ~/.openclaw/hooks/imessage-progress/
cp scripts/imessage/hooks/imessage-progress/handler.js ~/.openclaw/hooks/imessage-progress/
openclaw hooks enable imessage-progress   # not recommended — see warning above
```

### 5. Set compaction mode

Prevents the iMessage session context from bloating to 800K+ tokens (which causes EPIPE connection drops):

```bash
openclaw config set agents.defaults.compaction.mode safeguard
openclaw config set agents.defaults.compaction.keepRecentTokens 30000
```

### 6. Add to your agent's AGENTS.md

In your OpenClaw workspace `AGENTS.md`, add the progress pattern so the agent uses it on every multi-step iMessage task:

```markdown
## iMessage Live Progress

For any iMessage task with 3+ tool calls or >15s of work:

1. Send a bubble first:
   \`\`\`bash
   GUID=$(hal-progress start "⏳ Short description of what you're doing")
   \`\`\`
2. Update at each step (REPLACES the status line — never appends):
   \`\`\`bash
   hal-progress update "$GUID" exec "command you ran"
   hal-progress update "$GUID" found "what you discovered"
   hal-progress update "$GUID" thinking "why you're doing the next step"
   \`\`\`
3. Finish:
   \`\`\`bash
   hal-progress done "$GUID" "✅ What was accomplished"
   \`\`\`
```

---

## Usage

### Manual bubble control

```bash
# Open a bubble
GUID=$(hal-progress start "Fixing CI on PR #361")

# Update status (edits in place)
hal-progress update "$GUID" exec "pytest tests/ -x -q"
hal-progress update "$GUID" found "1 failing — removed_at column missing"
hal-progress update "$GUID" thinking "adding migration to init_db"

# Auto-run: shows (⚙️ exec) then (🔍 found) automatically
OUTPUT=$(hal-progress run "$GUID" "git push origin main")

# Change the header for a new sub-task
hal-progress header "$GUID" "Deploying to production"

# Done
hal-progress done "$GUID" "✅ PR merged and deployed"
```

### Check if a message was deleted (unsend detection)

```bash
STATUS=$(hal-progress check-deleted "$MESSAGE_GUID")
if [[ "$STATUS" == "deleted" ]]; then exit 0; fi
```

---

## Self-healing watchdog

The watchdog launcher compares the active script against the golden copy on every 30s cycle. If any session corrupts the watchdog (e.g. by writing wrong assumptions about `imsg launch` being a no-op — it is a no-op), it auto-restores from golden:

```
23:19:58 SELF-HEAL: watchdog restored from golden copy
23:20:06 Messages OK (bridge: ok)
```

### Key facts (verified by PID test)

- `imsg launch` **without `--force` is a true no-op** when the bridge is alive — Messages.app PID does not change
- macOS 15.4 Hardened Process ejects the injected dylib every ~90s — 30s proactive injection keeps the bridge continuously alive
- Bridge status must be checked with `imsg status --json` — the old string-match on "Available"/"Unavailable" is broken in imsg 0.17.0+
- Staleness should be detected via `chat.db-wal`, not `chat.db` (WAL mode makes the main file unreliable)

---

## Stress test

Run the 2-hour stress harness to verify everything works including after deliberate pauses:

```bash
nohup /bin/zsh scripts/imessage/imessage-stress-test.sh &
tail -f /tmp/imessage-stress-test.log
```

It checks bridge, config, RPC, Messages.app, and typing every 2 minutes — with deliberate 8-minute pauses every 7th cycle. Auto-messages you on completion.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Typing appears then vanishes | `openclaw.json` has an invalid key | `openclaw config validate` |
| No responses at all | iMessage session context bloated (800K+ tokens → EPIPE) | Send `/new` in iMessage; compaction to `safeguard` mode prevents recurrence |
| Bridge goes stale repeatedly | Watchdog corrupted by a session | Watchdog self-heals from golden copy automatically |
| Typing shows too late | Using log milestone lines (post-hoc) instead of chat.db polling | Sidecar v10 fixes this via 400ms chat.db polling |
| Bubbles duplicate / two at once | Auto-sidecar bubble + manual `hal-progress` both firing | Sidecar v10 is typing-only + end-of-turn summary; no auto-bubble |

---

## Files

| File | Purpose |
|---|---|
| `hal-progress` | Main bubble control script (start/update/run/header/done/check-deleted) |
| `hal-progress-exec` | Wrapper: run a command and auto-show (⚙️ exec) + (🔍 found) |
| `hal-progress-sidecar.js` | Node.js daemon: instant typing via chat.db + end-of-turn summary |
| `hal-progress-sidecar.golden.js` | Immutable reference copy of the sidecar |
| `messages-watchdog.sh` | Bridge keep-alive: proactive 30s injection + self-heal |
| `messages-watchdog.golden.sh` | Immutable reference copy of the watchdog |
| `messages-watchdog-launcher.sh` | LaunchAgent entry point: compares active vs golden, restores if corrupted |
| `imessage-stress-test.sh` | 2-hour continuous health + feature validation harness |
| `hooks/imessage-progress/` | OpenClaw Gateway hook: code-driven typing + bubble on every iMessage turn |