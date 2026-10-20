#!/usr/bin/env node
// hal-progress-sidecar v5 - AppleScript-first, bridge optional
// Root cause of bridge ejection: Messages.app Hardened Process entitlement
// Solution: never depend on bridge for sends, use bridge only for optional features

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_PATH = path.join(os.homedir(), 'Library/Logs/openclaw/gateway.log');
const IMSG = '/usr/local/bin/imsg';
const PHONE = '+12269983286';
const CHAT = 'iMessage;-;+12269983286';
const DB = path.join(os.homedir(), 'Library/Messages/chat.db');
const STATE_FILE = '/tmp/hal-progress-state.json';
const STATE_DIR = '/tmp/hal-progress-state';
try { require('fs').mkdirSync(STATE_DIR, { recursive: true }); } catch(_) {}
const IMSG_SESSION = 'agent:main:imessage:direct:+12269983286';

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch(_) { return {}; } }
function saveState(s) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch(_) {} }

// Send as thread reply to last user message — shows in-context
function getLastUserGuid() {
  const r = spawnSync('sqlite3', [DB, 'SELECT guid FROM message WHERE is_from_me=0 ORDER BY rowid DESC LIMIT 1;'], { encoding: 'utf8', timeout: 3000 });
  return (r.stdout || '').trim();
}

function sendBubble(text) {
  try {
    const r0 = spawnSync('sqlite3', [DB, 'SELECT COALESCE(MAX(rowid),0) FROM message WHERE is_from_me=1;'], { encoding: 'utf8', timeout: 3000 });
    const beforeRowid = (r0.stdout || '0').trim();
    // Try send-rich with reply-to first (threads to user's message)
    const replyGuid = getLastUserGuid();
    let sentViaRich = false;
    if (replyGuid) {
      const richResult = spawnSync(IMSG, ['send-rich', '--chat', CHAT, '--reply-to', replyGuid, '--text', text, '--json'], { encoding: 'utf8', timeout: 8000 });
      sentViaRich = (richResult.stdout || '').includes('guid') || richResult.status === 0;
    }
    if (!sentViaRich) {
      // Fallback: AppleScript send
      const script = 'tell application "Messages" to send "' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" to buddy "' + PHONE + '" of (first service whose service type = iMessage)';
      spawnSync('osascript', ['-e', script], { timeout: 8000 });
    }
    execSync('sleep 1.2');
    const r2 = spawnSync('sqlite3', [DB, 'SELECT guid FROM message WHERE is_from_me=1 AND rowid > ' + beforeRowid + ' ORDER BY rowid DESC LIMIT 1;'], { encoding: 'utf8', timeout: 3000 });
    return (r2.stdout || '').trim() || null;
  } catch(_) { return null; }
}

// Bridge features — best-effort only (bridge lasts ~90s before macOS ejects it)
function editBubble(guid, text) {
  try { spawnSync(IMSG, ["edit", "--chat", CHAT, "--message", guid, "--new-text", text, "--json"], { timeout: 5000 }); } catch(_) {}
}

function sendTyping() {
  try { spawnSync(IMSG, ["typing", "--to", PHONE, "--duration", "4s", "--json"], { timeout: 6000 }); } catch(_) {}
}

// On startup: wipe stale bubbles
(function cleanOnBoot() {
  const s = loadState();
  Object.values(s).forEach(info => {
    if (info.guid) { try { spawnSync(IMSG, ["unsend", "--chat", CHAT, "--message", info.guid, "--json"], { timeout: 5000 }); } catch(_) {} }
  });
  saveState({});
  console.log("[sidecar v5] boot cleanup done");
})();

const START_TIME = Date.now();
let lastSize = 0;
try { lastSize = fs.statSync(LOG_PATH).size; } catch(_) {}

function processLine(line) {
  if (!line.includes(IMSG_SESSION)) return;
  const tsMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (tsMatch && new Date(tsMatch[1]).getTime() < START_TIME) return;
  const runMatch = line.match(/runId=([a-f0-9-]{36})/);
  if (!runMatch) return;
  const runId = runMatch[1];

  if (line.includes("milestone=tool_execution_started") || line.includes("milestone=model_call_started")) {
    const active = loadState();
    if (!active[runId]) {
      sendTyping();
      // Extract context from log line for Telegram-style visibility
      let bubbleText = "\u23f3 Working...";
      if (line.includes('tool_execution_started')) {
        const stages = line.match(/stages=([^\s]+)/);
        if (stages && stages[1].includes('imessage')) bubbleText = "\u23f3 Processing your message...";
        else bubbleText = "\u23f3 Running tools...";
      } else if (line.includes('model_call_started')) {
        bubbleText = "\u23f3 Thinking...";
      }
      const guid = sendBubble(bubbleText);
      if (guid) {
        const typingTimer = setInterval(() => {
          const s = loadState();
          if (s[runId]) { sendTyping(); } else { clearInterval(typingTimer); }
        }, 2000);
        active[runId] = { guid, startedAt: Date.now(), source: "sidecar" };
        saveState(active);
        console.log(`[sidecar v5] sent bubble run=${runId.slice(0,8)} guid=${guid.slice(0,8)}`);
      }
    } else {
      sendTyping();
    }
    return;
  }

  if (line.includes("[imessage] embedded run agent end")) {
    const active = loadState();
    if (active[runId]) {
      console.log(`[sidecar v5] turn done run=${runId.slice(0,8)} — keeping bubble per user preference`);
      delete active[runId];
      saveState(active);
    }
  }
}

setInterval(() => {
  try {
    const stat = fs.statSync(LOG_PATH);
    if (stat.size <= lastSize) return;
    const fd = fs.openSync(LOG_PATH, "r");
    const buf = Buffer.alloc(stat.size - lastSize);
    fs.readSync(fd, buf, 0, buf.length, lastSize);
    fs.closeSync(fd);
    lastSize = stat.size;
    buf.toString("utf8").split("\n").filter(Boolean).forEach(processLine);
  } catch(_) {}
}, 500);

console.log("[sidecar v5] started — AppleScript-first sends, bridge optional");
