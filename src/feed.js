// Claudebot Ecosystem — live event feed.
// Polls the local server (server.js) for events your real bots report,
// and turns them into quests in the world.
//
// Event shape (POST these to /api/events):
//   { "bot": "Ada", "status": "started",   "title": "Fix login bug", "type": "code", "id": "task-123" }
//   { "bot": "Ada", "status": "progress",  "progress": 0.5, "id": "task-123" }
//   { "bot": "Ada", "status": "completed", "id": "task-123" }
//   { "bot": "Ada", "status": "failed",    "id": "task-123" }
(function () {
  const params = new URLSearchParams(location.search);
  const base = params.get("feed") || (location.protocol.startsWith("http") ? "" : null);
  const feed = { connected: false, url: null, seq: 0 };
  CBE.feed = feed;
  if (base === null) return; // opened as a file:// page — no server to talk to

  feed.url = base.replace(/\/$/, "") + "/api/events";

  function handle(e) {
    const status = String(e.status || "started").toLowerCase();
    const id = e.id != null ? String(e.id) : `${e.bot}:${e.title}`;
    if (status === "started" || status === "start") {
      const dup = CBE.game.quests.some((q) => q.externalId === id && q.status !== "done" && q.status !== "failed");
      if (dup) return;
      const bot = CBE.findBot(e.bot);
      if (bot) bot.external = true;
      else if (e.bot) CBE.addBot({ name: e.bot, color: e.color, skills: e.skills || (e.type ? [e.type] : null), external: true });
      CBE.addQuest({
        title: e.title || "Working…",
        type: e.type,
        difficulty: e.difficulty || 1,
        bot: e.bot,
        external: true,
        externalId: id,
        duration: null,
      });
    } else if (status === "progress") {
      CBE.resolveExternal(id, e.bot, true, Number(e.progress));
    } else if (status === "completed" || status === "done" || status === "success") {
      CBE.resolveExternal(id, e.bot, true);
    } else if (status === "failed" || status === "error") {
      CBE.resolveExternal(id, e.bot, false);
    }
  }

  async function poll() {
    try {
      const res = await fetch(`${feed.url}?since=${feed.seq}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      feed.connected = true;
      if ((data.seq || 0) < feed.seq) { feed.seq = 0; return; } // server restarted: resync
      for (const e of data.events || []) handle(e);
      feed.seq = data.seq || feed.seq;
    } catch (err) {
      feed.connected = false;
    } finally {
      setTimeout(poll, CBE.config.tuning.feedPollMs);
    }
  }

  CBE.startFeed = poll;
})();
