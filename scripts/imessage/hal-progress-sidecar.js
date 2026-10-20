#!/usr/bin/env node
// hal-progress-sidecar v8 — TYPING-ONLY, instant via chat.db polling
// Design: sidecar provides ONLY the native typing indicator (fast, from chat.db poll).
// Rich status bubbles come from the agent calling hal-progress manually (two-line format).
// No auto-bubbles — they just clutter. Typing starts the instant an inbound message lands.

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const LOG_PATH = path.join(os.homedir(), 'Library/Logs/openclaw/gateway.log');
const IMSG = '/usr/local/bin/imsg';
const PHONE = '+12269983286';
const DB = path.join(os.homedir(), 'Library/Messages/chat.db');
const IMSG_SESSION = 'agent:main:imessage:direct:+12269983286';

function sql(q) {
  const r = spawnSync('sqlite3', [DB, q], { encoding: 'utf8', timeout: 3000 });
  return (r.stdout || '').trim();
}
function sendTyping() {
  try { spawnSync(IMSG, ["typing", "--to", PHONE, "--duration", "6s", "--json"], { timeout: 7000 }); } catch(_) {}
}

// ── End-of-turn work summary ("📝 N files +X -Y · S steps · Ts") ──────────────
const REPOS = ["/Users/hal9000/friday-pro", "/Users/hal9000/.openclaw/workspace"];
function statNum(s, kw) { for (const p of s.split(",")) { if (p.includes(kw)) return parseInt(p.trim()) || 0; } return 0; }
function gitStat(repo) {
  try {
    let r = spawnSync("git", ["-C", repo, "diff", "--shortstat", "HEAD"], { encoding: "utf8", timeout: 4000 });
    if (r.status !== 0) r = spawnSync("git", ["-C", repo, "diff", "--shortstat"], { encoding: "utf8", timeout: 4000 });
    const out = (r.stdout || "").trim();
    return { files: statNum(out, "file"), ins: statNum(out, "insertion"), del: statNum(out, "deletion") };
  } catch (_) { return { files: 0, ins: 0, del: 0 }; }
}
function snapshotRepos() { const s = {}; for (const r of REPOS) s[r] = gitStat(r); return s; }
function deltaSummary(startSnap) {
  let files = 0, ins = 0, del = 0;
  for (const repo of REPOS) {
    const b = (startSnap && startSnap[repo]) || { files: 0, ins: 0, del: 0 };
    const a = gitStat(repo);
    const fd = a.files - b.files;
    files += fd > 0 ? fd : (a.files !== b.files ? a.files : 0);
    ins += Math.max(0, a.ins - b.ins);
    del += Math.max(0, a.del - b.del);
  }
  return { files, ins, del };
}
function buildSummary(info) {
  const secs = Math.max(1, Math.round((Date.now() - (info.startedAt || Date.now())) / 1000));
  const steps = info.toolCount || 0;
  const d = deltaSummary(info.startSnap);
  const parts = [];
  if (d.files > 0) {
    let f = "📝 " + d.files + " file" + (d.files === 1 ? "" : "s");
    if (d.ins > 0) f += " +" + d.ins;
    if (d.del > 0) f += " -" + d.del;
    parts.push(f);
  }
  if (steps > 0) parts.push(steps + " step" + (steps === 1 ? "" : "s"));
  parts.push(secs + "s");
  return "✅ Done · " + parts.join(" · ");
}
function getLastUserGuid() { return sql("SELECT guid FROM message WHERE is_from_me=0 ORDER BY rowid DESC LIMIT 1;"); }
function sendBubble(text) {
  const rg = getLastUserGuid();
  if (rg) {
    const r = spawnSync(IMSG, ["send-rich", "--chat", "iMessage;-;" + PHONE, "--reply-to", rg, "--text", text, "--json"], { timeout: 6000 });
    if (r.status === 0) return;
  }
  try { spawnSync(IMSG, ["send", "--to", PHONE, "--text", text, "--json"], { timeout: 6000 }); } catch(_) {}
}
function sendBubbleGuid(text) {
  const beforeRow = parseInt(sql("SELECT COALESCE(MAX(rowid),0) FROM message WHERE is_from_me=1;")) || 0;
  const rg = getLastUserGuid();
  if (rg) {
    const r = spawnSync(IMSG, ["send-rich", "--chat", "iMessage;-;" + PHONE, "--reply-to", rg, "--text", text, "--json"], { timeout: 6000 });
    if (r.status === 0) {
      spawnSync("sleep", ["1.0"]);
      return sql("SELECT guid FROM message WHERE is_from_me=1 AND rowid>" + beforeRow + " ORDER BY rowid DESC LIMIT 1;") || null;
    }
  }
  return null;
}
function editBubble(guid, text) {
  try { spawnSync(IMSG, ["edit", "--chat", "iMessage;-;" + PHONE, "--message", guid, "--new-text", text, "--json"], { timeout: 5000 }); } catch(_) {}
}
// Embodied status per activity. The gateway log only distinguishes model-call
// (thinking) from tool-exec (running a command), so those are the two we embody.
function statusFor(line) {
  if (line.includes("milestone=model_call_started")) return "🧠 Thinking…";
  if (line.includes("milestone=tool_execution_started")) return "🔧 Running a command…";
  return null;
}
function finishTurn() {
  if (turnStartSnap === null) return;
  const info = { startedAt: turnStartedAt, toolCount: turnToolCount, startSnap: turnStartSnap };
  turnStartSnap = null;
  try {
    const s = buildSummary(info);
    if (turnBubbleGuid) editBubble(turnBubbleGuid, s);
    else sendBubble(s);
    console.log("[sidecar v10] turn done: " + s);
  } catch(_) {}
  turnBubbleGuid = null;
  turnLastStatus = "";
}

console.log("[sidecar v10] started — embodied status + end-of-turn summary");

// Instant typing: poll chat.db for new inbound, keep typing alive while turn runs
let lastSeenRow = parseInt(sql("SELECT COALESCE(MAX(rowid),0) FROM message;")) || 0;
let typingTimer = null;
let turnStartedAt = 0;
let turnStartSnap = null;
let turnToolCount = 0;
let turnBubbleGuid = null;
let turnLastStatus = "";

function startTyping() {
  if (typingTimer) return;
  sendTyping();
  typingTimer = setInterval(sendTyping, 4000);
  turnStartedAt = Date.now();
  turnStartSnap = snapshotRepos();
  turnToolCount = 0;
  turnLastStatus = "🧠 Thinking…";
  turnBubbleGuid = sendBubbleGuid(turnLastStatus);
  console.log("[sidecar v10] turn started, bubble=" + (turnBubbleGuid || "none"));
}
function stopTyping() {
  if (typingTimer) { clearInterval(typingTimer); typingTimer = null; console.log("[sidecar v8] typing stopped"); }
}

// Poll chat.db every 400ms for new inbound message → instant typing
setInterval(() => {
  try {
    const maxRow = parseInt(sql("SELECT COALESCE(MAX(rowid),0) FROM message;")) || 0;
    if (maxRow <= lastSeenRow) return;
    const newInbound = sql("SELECT COUNT(*) FROM message WHERE rowid>" + lastSeenRow + " AND is_from_me=0 AND text IS NOT NULL;");
    lastSeenRow = maxRow;
    if (parseInt(newInbound) > 0) startTyping();
  } catch(_) {}
}, 400);

// Watch gateway.log for turn end → stop typing
const fs = require('fs');
let lastSize = 0;
try { lastSize = fs.statSync(LOG_PATH).size; } catch(_) {}
setInterval(() => {
  try {
    const stat = fs.statSync(LOG_PATH);
    if (stat.size <= lastSize) return;
    const fd = fs.openSync(LOG_PATH, "r");
    const buf = Buffer.alloc(stat.size - lastSize);
    fs.readSync(fd, buf, 0, buf.length, lastSize);
    fs.closeSync(fd);
    lastSize = stat.size;
    buf.toString("utf8").split("\n").filter(Boolean).forEach(line => {
      if (line.includes(IMSG_SESSION)) {
        if (line.includes("milestone=tool_execution_started")) turnToolCount++;
        const st = statusFor(line);
        if (st && turnBubbleGuid && st !== turnLastStatus) {
          editBubble(turnBubbleGuid, st);
          turnLastStatus = st;
        }
      }
      if (line.includes("[imessage] embedded run agent end") || line.includes("[imessage] delivered reply")) {
        finishTurn();
        stopTyping();
      }
    });
  } catch(_) {}
}, 500);

// Safety timeout: stop typing after 3min
setInterval(() => {
  if (typingTimer && Date.now() - turnStartedAt > 180000) stopTyping();
}, 10000);
