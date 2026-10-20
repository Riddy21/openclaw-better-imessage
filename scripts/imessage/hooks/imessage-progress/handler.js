// imessage-progress hook v2 — fires on every inbound iMessage.
// Starts a looping typing indicator (background) + progress bubble.
// Saves bubble GUID to /tmp/hal-progress-current so hal-progress start can adopt it.
import { spawnSync, spawn } from "child_process";
import { writeFileSync, mkdirSync } from "fs";

const PHONE = "+12269983286";
const CHAT = "iMessage;-;+12269983286";
const IMSG = "/usr/local/bin/imsg";
const DB = "/Users/hal9000/Library/Messages/chat.db";
const CUR_FILE = "/tmp/hal-progress-current";
const STATE_DIR = "/tmp/hal-progress-state";
const MANUAL_FLAG = "/tmp/hal-progress-manual";

function sql(q) {
  const r = spawnSync("sqlite3", [DB, q], { encoding: "utf8", timeout: 3000 });
  return (r.stdout || "").trim();
}

export default function handler(event) {
  try {
    const key = event.sessionKey || (event.context && event.context.sessionKey) || "";
    if (!String(key).includes("imessage")) return;

    // Loop typing in background: fire imsg typing every 5s for up to 3 min
    const typingScript = [
      "for i in {1..36}; do",
      "  /usr/local/bin/imsg typing --to +12269983286 --duration 5s --json >/dev/null 2>&1",
      "  sleep 4.5",
      "  [[ ! -f /tmp/hal-progress-manual ]] && break",
      "done"
    ].join("\n");
    const typingProc = spawn("zsh", ["-c", typingScript], { detached: true, stdio: "ignore" });
    typingProc.unref();

    // Send initial bubble as thread reply
    const replyGuid = sql("SELECT guid FROM message WHERE is_from_me=0 ORDER BY rowid DESC LIMIT 1;");
    if (!replyGuid) return;

    const before = sql("SELECT COALESCE(MAX(rowid),0) FROM message WHERE is_from_me=1;");
    spawnSync(IMSG, ["send-rich", "--chat", CHAT, "--reply-to", replyGuid, "--text", "\u23f3 On it\u2026", "--json"], { timeout: 6000 });
    spawnSync("sleep", ["1.2"]);

    const guid = sql("SELECT guid FROM message WHERE is_from_me=1 AND rowid>" + (before || "0") + " ORDER BY rowid DESC LIMIT 1;");
    if (guid && guid.length < 60) {
      try { mkdirSync(STATE_DIR, { recursive: true }); } catch(_) {}
      const ts = String(Math.floor(Date.now() / 1000));
      // Write GUID and timestamp for hal-progress start to adopt
      writeFileSync(CUR_FILE, guid);
      writeFileSync(CUR_FILE + ".ts", ts);
      // Write header state for compose
      writeFileSync(STATE_DIR + "/" + guid + ".txt", "\u23f3 On it\u2026");
      writeFileSync(STATE_DIR + "/" + guid + ".steps", "");
      // Touch manual flag so typing loop keeps running
      writeFileSync(MANUAL_FLAG, "");
    }
  } catch (_) {}
}
