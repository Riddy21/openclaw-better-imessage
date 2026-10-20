# hal-progress

iMessage live progress bubbles for OpenClaw AI agents — two-line replacing format.

## Format

Every task shows as:

```
⏳ Task name

(exec): current step — updates in place
```

The header stays. The status line replaces on each update.

## Install

```bash
git clone https://github.com/Riddy21/hal-progress
cd hal-progress
./install.sh
```

## Usage

```bash
GUID=$(hal-progress start "Fixing CI on PR 361")
hal-progress update "$GUID" "(exec): ruff check . → clean"
hal-progress update "$GUID" "(exec): pytest 38/38 passed"
hal-progress update "$GUID" "(exec): git push → pushed ✅"
```

## Components

- `bin/hal-progress` — main script (v9, two-line replacing format)
- `bin/hal-progress-sidecar.js` — Node.js daemon that auto-fires on every turn
- `bin/hal-progress-exec` — wrapper that shows any command in the bubble
- `bin/messages-watchdog.sh` — keeps iMessage bridge healthy
- `launchagent/ai.openclaw.hal-progress.plist` — LaunchAgent for sidecar

## Requirements

- macOS 13+
- OpenClaw (https://openclaw.ai)
- imsg (`brew install openclaw/tap/imsg`)
- Node.js 18+

## How it works

Uses `imsg send-rich --reply-to` to thread progress bubbles to the triggering message,
`imsg edit` to update the status line, and AppleScript fallback when the IMCore bridge
is stale (happens every ~90s on macOS 15.4 due to Hardened Process protections).
