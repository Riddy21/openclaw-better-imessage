# openclaw-better-imessage

A drop-in package that makes **OpenClaw's iMessage channel feel alive** on macOS:
live progress bubbles, an instant typing indicator, end-of-turn work summaries,
and a self-healing bridge watchdog so Messages never silently stops responding.

> Everything is self-contained. One `./install.sh +1XXXXXXXXXX` and you're running.

---

## What you get

| Feature | What it looks like |
|---|---|
| **Rich progress bubbles** | A single iMessage bubble per task that edits itself in place as work happens |
| **Embodied statuses** | `⚙️ exec`, `🤔 thinking`, `🔍 found`, `❌ error` — not vague "working…" |
| **Auto done-summary** | Bubble resolves to `✅ Done · 📝 3 files +468 -12 · 7 steps · 42s` |
| **Instant typing** | The "…" typing indicator starts the moment your message lands |
| **Bridge watchdog** | Re-injects the IMCore bridge every 30s so typing/edits never go stale |

### Example

A task renders as ONE bubble that updates live:

```
⏳ Fixing CI on PR #361

(⚙️ exec): pytest -q
```
…edits in place…
```
⏳ Fixing CI on PR #361

(🔍 found): 1094 passed, 0 failed
```
…and finishes as…
```
⏳ Fixing CI on PR #361

✅ Done · 📝 4 files +120 -8 · 12 steps · 1m03s
```

---

## How it works

Two cooperating pieces:

### 1. `hal-progress` (agent-driven, rich)
A zsh CLI the agent calls to narrate a task:
```bash
GUID=$(hal-progress start "Fixing CI on PR #361")
hal-progress update "$GUID" exec     "pytest -q"
hal-progress update "$GUID" found    "1094 passed"
hal-progress update "$GUID" thinking "safe to push"
hal-progress done   "$GUID"          # auto-computes the ✅ summary
```
- **Two-line replacing format:** a fixed header + a status line that is *replaced*
  (never appended), so one bubble tells the whole story.
- **`done`** auto-computes the summary from `git diff --shortstat` across your
  repos plus elapsed time — no need to pass text.

### 2. `hal-progress-sidecar.js` (automatic, v11)
A LaunchAgent that watches `gateway.log` and `chat.db`:
- Starts the **typing indicator** instantly on a new inbound message (chat.db poll).
- Shows an **embodied auto-status** (🧠 Thinking / 🔧 Running a command) for turns
  where the agent doesn't post manually, then an **end-of-turn ✅ summary**.
- **Hands off** to `hal-progress` when the agent drives a rich bubble — a shared
  marker file (`/tmp/hal-progress-manual`) tells the sidecar to stay quiet so you
  never get duplicate bubbles.

### 3. Bridge watchdog (keeps it reliable)
macOS ejects the private IMCore bridge dylib every ~90s, which kills typing/edits.
- `messages-watchdog.sh` proactively re-injects every 30s (a no-op when healthy).
- `messages-watchdog-launcher.sh` restores the watchdog from a golden copy if a
  session ever corrupts it (tamper-resistant).
- `imsg-autolaunch.sh` injects the bridge at login.
- `messages-keepalive` keeps Messages.app running.

---

## Install

```bash
git clone https://github.com/Riddy21/openclaw-better-imessage
cd openclaw-better-imessage
./install.sh +1XXXXXXXXXX      # your iMessage number
```

This installs the scripts to `/usr/local/bin`, the LaunchAgents to
`~/Library/LaunchAgents`, and loads them. Requires the `imsg` CLI (private-API
bridge) and `sqlite3` (ships with macOS).

## Uninstall
```bash
./uninstall.sh
```

---

## Components

```
bin/
  hal-progress                  rich two-line progress bubble CLI (start/update/run/done)
  hal-progress-exec             helper: run a command + reflect it in the bubble
  hal-progress-sidecar.js       v11 auto typing + embodied status + end-of-turn summary
  messages-watchdog.sh          30s proactive bridge re-injection
  messages-watchdog-launcher.sh golden-copy self-heal wrapper (what the agent loads)
  imsg-autolaunch.sh            inject the bridge at login
launchagents/
  ai.openclaw.hal-progress.plist       runs the sidecar
  ai.openclaw.messages-watchdog.plist  runs the watchdog every 30s
  ai.openclaw.messages-keepalive.plist keeps Messages.app open
  ai.openclaw.imsg-launch.plist        injects the bridge at login
```

## Requirements
- macOS (tested on 15.4)
- OpenClaw with the iMessage channel
- `imsg` CLI with the IMCore bridge (advanced features: typing, edit, send-rich)
- SIP considerations apply to the private-API bridge (same as `imsg`)
