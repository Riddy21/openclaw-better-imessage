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

console.log("[sidecar v8] started — typing-only, instant chat.db trigger");

// Instant typing: poll chat.db for new inbound, keep typing alive while turn runs
let lastSeenRow = parseInt(sql("SELECT COALESCE(MAX(rowid),0) FROM message;")) || 0;
let typingTimer = null;
let turnStartedAt = 0;

function startTyping() {
  if (typingTimer) return;
  sendTyping();
  typingTimer = setInterval(sendTyping, 4000);
  turnStartedAt = Date.now();
  console.log("[sidecar v8] typing started");
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
      if (line.includes("[imessage] embedded run agent end") || line.includes("[imessage] delivered reply")) {
        stopTyping();
      }
    });
  } catch(_) {}
}, 500);

// Safety timeout: stop typing after 3min
setInterval(() => {
  if (typingTimer && Date.now() - turnStartedAt > 180000) stopTyping();
}, 10000);
