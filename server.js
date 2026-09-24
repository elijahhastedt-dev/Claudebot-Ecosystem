#!/usr/bin/env node
// Claudebot Ecosystem — tiny local server (no dependencies).
//
//   node server.js            # http://127.0.0.1:8787
//   PORT=9000 node server.js
//
// Serves the game and an event API your bots report to:
//   POST /api/events   body: one event object or an array of them
//   GET  /api/events?since=<seq>
//
// A page that connects fresh (since=0) gets the "started" events of tasks
// still in progress, so bots that are mid-task show up right away.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const MAX_EVENTS = 1000;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

let seq = 0;
const events = [];          // ring buffer of { seq, ...event }
const open = new Map();     // task id -> started event, for late joiners

function taskId(e) {
  return e.id != null ? String(e.id) : `${e.bot}:${e.title}`;
}

function record(raw) {
  if (!raw || typeof raw !== "object") return null;
  const e = {
    bot: String(raw.bot || "Claudebot").slice(0, 24),
    status: String(raw.status || "started").toLowerCase(),
    title: raw.title != null ? String(raw.title).slice(0, 120) : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
    id: raw.id != null ? String(raw.id).slice(0, 120) : undefined,
    difficulty: raw.difficulty,
    progress: raw.progress,
    color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : undefined,
    skills: Array.isArray(raw.skills) ? raw.skills.map(String).slice(0, 8) : undefined,
    at: Date.now(),
    seq: ++seq,
  };
  const id = taskId(e);
  if (e.status === "started" || e.status === "start") open.set(id, e);
  else if (e.status !== "progress") open.delete(id);
  events.push(e);
  if (events.length > MAX_EVENTS) events.shift();
  return e;
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") return send(res, 204, "");

  if (url.pathname === "/api/events") {
    if (req.method === "GET") {
      const since = Number(url.searchParams.get("since")) || 0;
      const out = since === 0 ? [...open.values()] : events.filter((e) => e.seq > since);
      return send(res, 200, { seq, events: out });
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(body || "{}"); } catch { return send(res, 400, { error: "invalid JSON" }); }
        const list = (Array.isArray(parsed) ? parsed : [parsed]).map(record).filter(Boolean);
        list.forEach((e) => console.log(`[${new Date(e.at).toLocaleTimeString()}] ${e.bot} ${e.status}${e.title ? `: ${e.title}` : ""}`));
        send(res, 200, { ok: true, accepted: list.length, seq });
      });
      return;
    }
    return send(res, 405, { error: "method not allowed" });
  }

  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed", "text/plain");

  // Static files, confined to this folder.
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || path.relative(ROOT, file).split(path.sep).some((p) => p.startsWith("."))) return send(res, 404, "not found", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "not found", "text/plain");
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Claudebot Ecosystem running at http://${HOST}:${PORT}`);
  console.log(`Report bot activity with: curl -X POST http://${HOST}:${PORT}/api/events -d '{"bot":"Ada","status":"started","title":"Fix bug","type":"code","id":"t1"}'`);
});
