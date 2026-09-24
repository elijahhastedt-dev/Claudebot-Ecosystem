#!/usr/bin/env node
// Report Claude Code activity to the Claudebot Ecosystem.
//
// Wire it up as Claude Code hooks (see examples/claude-settings.json):
//   UserPromptSubmit -> node claude-hook.js start
//   Stop             -> node claude-hook.js stop
//
// Env vars (all optional):
//   CLAUDEBOT_NAME  bot name shown in the game (default: the project folder name)
//   CLAUDEBOT_TYPE  station: code | review | research | deploy | writing (default: guessed from the prompt)
//   CLAUDEBOT_URL   default http://127.0.0.1:8787/api/events
//
// Never blocks Claude: it gives up after 1.5s and always exits 0.

const path = require("path");

const mode = process.argv[2] === "stop" ? "stop" : "start";
const url = process.env.CLAUDEBOT_URL || "http://127.0.0.1:8787/api/events";

function guessType(prompt) {
  const p = prompt.toLowerCase();
  if (/\b(review|audit|test|verify|check|lint)\b/.test(p)) return "review";
  if (/\b(deploy|release|ship|publish|migrate|infra|ci)\b/.test(p)) return "deploy";
  if (/\b(research|investigate|why|explain|compare|find out|look into)\b/.test(p)) return "research";
  if (/\b(doc|docs|readme|write|design|copy|blog|ui|ux)\b/.test(p)) return "writing";
  return "code";
}

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  let hook = {};
  try { hook = JSON.parse(input || "{}"); } catch {}
  const bot = process.env.CLAUDEBOT_NAME || path.basename(hook.cwd || process.cwd());
  const id = hook.session_id || bot;
  const prompt = String(hook.prompt || "").replace(/\s+/g, " ").trim();

  const event = mode === "start"
    ? { bot, status: "started", id, title: prompt.slice(0, 60) || "Thinking…", type: process.env.CLAUDEBOT_TYPE || guessType(prompt) }
    : { bot, status: "completed", id };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // The game isn't running — that's fine.
  }
  process.exit(0);
});
