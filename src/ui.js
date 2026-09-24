// Claudebot Ecosystem — HUD panels (roster, quest board, log, controls).
(function () {
  const game = CBE.game;
  const cfg = CBE.config;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const station = (type) => CBE.stationByType[type];

  // Only touch the DOM when content changed, so clicks and hovers aren't interrupted.
  const cache = {};
  function setHTML(sel, html) {
    if (cache[sel] === html) return;
    cache[sel] = html;
    $(sel).innerHTML = html;
  }

  const STATUS = { idle: "Idle in the square", walking: "Heading out", working: "Working", returning: "Heading home" };

  function renderStats() {
    const c = game.clock();
    const active = game.quests.filter((q) => q.status === "active" || q.status === "walking").length;
    const queued = game.quests.filter((q) => q.status === "queued").length;
    $("#stat-clock").textContent = `Day ${c.day} · ${String(c.h).padStart(2, "0")}:${String(c.m).padStart(2, "0")}`;
    $("#stat-gold").textContent = game.gold;
    $("#stat-done").textContent = game.completed;
    $("#stat-active").textContent = `${active} / ${queued}`;
    const f = CBE.feed;
    const el = $("#feed-status");
    el.className = "feed " + (f && f.connected ? "on" : "off");
    el.textContent = f && f.connected ? "LIVE FEED" : "DEMO ONLY";
    el.title = f && f.connected ? `Listening to ${f.url}` : "Run `node server.js` to connect real bots";
  }

  function renderRoster() {
    const html = game.bots.map((b) => {
      const need = CBE.xpForLevel(b.level);
      const pct = Math.round((b.xp / need) * 100);
      const task = b.quest ? `${station(b.quest.type).icon} ${esc(b.quest.title)}` : STATUS[b.state];
      const skills = b.skills.map((s) => `<span class="chip" style="--c:${station(s) ? station(s).color : "#888"}">${station(s) ? station(s).icon : "?"}</span>`).join("");
      return `<li class="bot ${game.selectedBotId === b.id ? "sel" : ""} ${b.state}" data-id="${b.id}">
        <div class="avatar" style="--c:${b.color}"><span class="lv">${b.level}</span></div>
        <div class="meta">
          <div class="row"><b>${esc(b.name)}</b>${b.external ? '<span class="tag">LIVE</span>' : ""}<span class="skills">${skills}</span></div>
          <div class="task">${task}</div>
          <div class="xp"><i style="width:${pct}%"></i><span>${b.xp}/${need} XP</span></div>
        </div>
      </li>`;
    }).join("");
    setHTML("#roster", html);
    $("#roster-count").textContent = game.bots.length;
  }

  function renderQuests() {
    const order = { active: 0, walking: 1, queued: 2, done: 3, failed: 4 };
    const list = [...game.quests].sort((a, b) => order[a.status] - order[b.status] || (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 14);
    const botName = (q) => (game.bots.find((b) => b.id === q.botId) || {}).name || q.botName || "—";
    setHTML("#quests", list.length ? list.map((q) => {
      const s = station(q.type);
      const pct = q.progress == null ? null : Math.round(q.progress * 100);
      const label = { active: "IN PROGRESS", walking: "ACCEPTED", queued: "OPEN", done: "COMPLETE", failed: "FAILED" }[q.status];
      return `<li class="quest ${q.status}">
        <span class="qicon" style="--c:${s.color}">${s.icon}</span>
        <div class="qmeta">
          <div class="qtitle">${esc(q.title)}</div>
          <div class="qsub">${"★".repeat(q.difficulty)}<span class="dim">${"★".repeat(3 - q.difficulty)}</span> · ${esc(s.name)} · ${esc(botName(q))}</div>
          ${q.status === "active" ? `<div class="qbar ${pct == null ? "indet" : ""}"><i style="width:${pct == null ? 30 : pct}%;--c:${s.color}"></i></div>` : ""}
        </div>
        <span class="qstatus">${label}</span>
      </li>`;
    }).join("") : `<li class="empty">No quests yet. Post one!</li>`);
  }

  function renderLog() {
    setHTML("#log", game.log.slice(0, 30).map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`).join(""));
  }

  function renderInspector() {
    const b = game.bots.find((x) => x.id === game.selectedBotId);
    const el = $("#inspector");
    if (!b) { el.hidden = true; return; }
    el.hidden = false;
    const need = CBE.xpForLevel(b.level);
    setHTML("#inspector", `
      <button class="x" aria-label="Close">×</button>
      <div class="ihead"><div class="avatar big" style="--c:${b.color}"><span class="lv">${b.level}</span></div>
        <div><h3>${esc(b.name)}</h3><div class="dim">Level ${b.level} Claudebot${b.external ? " · live" : ""}</div></div></div>
      <dl>
        <dt>Status</dt><dd>${b.quest ? esc(b.quest.title) : STATUS[b.state]}</dd>
        <dt>XP</dt><dd>${b.xp} / ${need}</dd>
        <dt>Quests done</dt><dd>${b.done}</dd>
        <dt>Gold earned</dt><dd>${b.gold}</dd>
        <dt>Skills</dt><dd>${b.skills.map((s) => station(s) ? esc(station(s).name) : esc(s)).join(", ")}</dd>
      </dl>`);
  }

  const refresh = () => { renderStats(); renderRoster(); renderQuests(); renderLog(); renderInspector(); };

  function toast(html) {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = html;
    $("#toasts").appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  function setupControls() {
    $("#btn-pause").addEventListener("click", () => {
      game.paused = !game.paused;
      $("#btn-pause").textContent = game.paused ? "▶" : "❚❚";
      $("#btn-pause").setAttribute("aria-label", game.paused ? "Resume" : "Pause");
    });
    document.querySelectorAll("[data-speed]").forEach((btn) => btn.addEventListener("click", () => {
      game.speed = Number(btn.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", b === btn));
    }));
    $("#btn-demo").addEventListener("click", () => {
      game.demo = !game.demo;
      $("#btn-demo").classList.toggle("on", game.demo);
    });

    // New quest dialog
    const dlg = $("#quest-dialog");
    const typeSel = $("#q-type");
    typeSel.innerHTML = cfg.stations.map((s) => `<option value="${s.type}">${s.icon} ${esc(s.name)}</option>`).join("");
    const fillBots = () => {
      $("#q-bot").innerHTML = `<option value="">Anyone (best fit)</option>` + game.bots.map((b) => `<option>${esc(b.name)}</option>`).join("");
    };
    $("#btn-quest").addEventListener("click", () => { fillBots(); dlg.showModal(); $("#q-title").focus(); });
    $("#q-cancel").addEventListener("click", () => dlg.close());
    $("#quest-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = $("#q-title").value.trim();
      if (!title) return;
      CBE.addQuest({ title, type: typeSel.value, difficulty: $("#q-diff").value, bot: $("#q-bot").value || null });
      $("#q-title").value = "";
      dlg.close();
    });

    // New bot dialog
    const bdlg = $("#bot-dialog");
    $("#b-skills").innerHTML = cfg.stations.map((s) => `<label class="check"><input type="checkbox" value="${s.type}"> ${s.icon} ${esc(s.name)}</label>`).join("");
    $("#btn-bot").addEventListener("click", () => { bdlg.showModal(); $("#b-name").focus(); });
    $("#b-cancel").addEventListener("click", () => bdlg.close());
    $("#bot-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#b-name").value.trim();
      if (!name) return;
      const skills = [...document.querySelectorAll("#b-skills input:checked")].map((i) => i.value);
      const bot = CBE.addBot({ name, skills, color: $("#b-color").value });
      game.selectedBotId = bot.id;
      $("#b-name").value = "";
      bdlg.close();
      refresh();
    });

    $("#roster").addEventListener("click", (e) => {
      const li = e.target.closest("li.bot");
      if (!li) return;
      game.selectedBotId = game.selectedBotId === li.dataset.id ? null : li.dataset.id;
      refresh();
    });
    $("#inspector").addEventListener("click", (e) => {
      if (e.target.closest(".x")) { game.selectedBotId = null; refresh(); }
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea") || document.querySelector("dialog[open]")) return;
      if (e.key === " ") { e.preventDefault(); $("#btn-pause").click(); }
      if (e.key === "q" || e.key === "Q") $("#btn-quest").click();
      if (e.key === "Escape") { game.selectedBotId = null; refresh(); }
      if (["1", "2", "3"].includes(e.key)) document.querySelectorAll("[data-speed]")[Number(e.key) - 1].click();
    });
  }

  function init() {
    setupControls();
    game.on("roster", renderRoster);
    game.on("quests", renderQuests);
    game.on("log", renderLog);
    game.on("select", refresh);
    game.on("levelup", (b) => toast(`<b>★ LEVEL UP!</b><span>${esc(b.name)} is now level ${b.level}</span>`));
    refresh();
    setInterval(refresh, 250); // cheap: the lists are small
  }

  CBE.ui = { init, refresh, toast };
})();
