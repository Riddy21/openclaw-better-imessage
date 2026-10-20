// imessage-progress hook — fires on every inbound iMessage dispatch.
// Starts typing + a progress bubble in code, so feedback is guaranteed
// regardless of whether the agent remembers to call hal-progress.
import { spawnSync } from "child_process";

const PHONE = "+12269983286";
const CHAT = "iMessage;-;+12269983286";
const IMSG = "/usr/local/bin/imsg";
const DB = "/Users/hal9000/Library/Messages/chat.db";

export default function handler(event) {
  try {
    const key = event.sessionKey || (event.context && event.context.sessionKey) || "";
    if (!String(key).includes("imessage")) return;

    // Native typing indicator — instant feedback
    try {
      spawnSync(IMSG, ["typing", "--to", PHONE, "--duration", "6s", "--json"], { timeout: 7000 });
    } catch (_) {}

    // Start a progress bubble as a thread reply to the user's message
    try {
      const rg = spawnSync("sqlite3", [DB, "SELECT guid FROM message WHERE is_from_me=0 ORDER BY rowid DESC LIMIT 1;"], { encoding: "utf8", timeout: 3000 });
      const replyGuid = (rg.stdout || "").trim();
      if (replyGuid) {
        spawnSync(IMSG, ["send-rich", "--chat", CHAT, "--reply-to", replyGuid, "--text", "\u23f3 On it\u2026", "--json"], { timeout: 6000 });
      }
    } catch (_) {}
  } catch (_) {}
}
