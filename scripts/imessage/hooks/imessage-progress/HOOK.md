---
name: imessage-progress
description: "Auto-start a progress bubble + typing on every iMessage turn (code-driven, not behavioral)"
metadata:
  { "openclaw": { "events": ["message:received"] } }
---

# iMessage Progress

On every inbound iMessage, immediately send the native typing indicator and
start a progress bubble so the user sees activity without the agent having to
remember to call hal-progress. The agent can still update the bubble with
rich (exec)/(found)/(thinking) detail via hal-progress during the turn.
