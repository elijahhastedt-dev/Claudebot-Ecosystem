// Claudebot Ecosystem — simulation + rendering.
// World state lives in CBE.game; the DOM panels in ui.js read from it.
(function () {
  const cfg = CBE.config;
  const W = cfg.world.width;
  const H = cfg.world.height;
  const T = cfg.tuning;
  const FONT = '"Press Start 2P", ui-monospace, monospace';

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const stationByType = Object.fromEntries(cfg.stations.map((s) => [s.type, s]));
  const xpForLevel = (lvl) => Math.round(100 * Math.pow(lvl, 1.5));

  function seeded(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => clamp(Math.round(c + amt * 255), 0, 255);
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  const BOT_COLORS = ["#d97757", "#6a9bcc", "#9b7fd1", "#56b49a", "#e3b341", "#e0708f", "#7fbf5a", "#c98b4f", "#5fc4d9", "#b58ad6"];

  // ---------- game state ----------
  const game = {
    time: 0,            // game seconds since start
    speed: 1,
    paused: false,
    demo: true,
    bots: [],
    quests: [],
    particles: [],
    log: [],
    gold: 0,
    completed: 0,
    selectedBotId: null,
    nextDemoAt: 2,
    listeners: {},
  };
  CBE.game = game;

  let uid = 1;
  const newId = (p) => p + uid++;

  function emit(evt, data) {
    (game.listeners[evt] || []).forEach((fn) => fn(data));
  }
  game.on = (evt, fn) => ((game.listeners[evt] = game.listeners[evt] || []).push(fn));

  function log(text, kind = "info") {
    game.log.unshift({ t: game.time, text, kind });
    if (game.log.length > 60) game.log.pop();
    emit("log");
  }

  // ---------- bots ----------
  function addBot(opts) {
    const existing = findBot(opts.name);
    if (existing) return existing;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * cfg.hub.r * 0.7;
    const bot = {
      id: newId("b"),
      name: opts.name,
      color: opts.color || BOT_COLORS[game.bots.length % BOT_COLORS.length],
      skills: opts.skills && opts.skills.length ? opts.skills : cfg.stations.map((s) => s.type),
      x: cfg.hub.x + Math.cos(a) * r,
      y: cfg.hub.y + Math.sin(a) * r,
      path: [],
      state: "idle",
      at: "hub",
      quest: null,
      level: 1,
      xp: 0,
      gold: 0,
      done: 0,
      facing: 1,
      walkT: Math.random() * 10,
      blinkAt: rand(1, 4),
      wanderAt: rand(0.5, 3),
      speed: rand(52, 64),
      external: !!opts.external,
    };
    game.bots.push(bot);
    log(`${bot.name} joined the village`, "join");
    emit("roster");
    return bot;
  }

  function findBot(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    return game.bots.find((b) => b.name.toLowerCase() === n) || null;
  }

  function hubPoint() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * cfg.hub.r * 0.8;
    return { x: cfg.hub.x + Math.cos(a) * r, y: cfg.hub.y + Math.sin(a) * r };
  }

  // Build a waypoint path from wherever the bot is to `target`,
  // following the roads (station route <-> hub <-> station route).
  function routeTo(bot, stationType, finalPoint) {
    const pts = [];
    if (bot.at !== "hub") {
      const from = stationByType[bot.at];
      if (from) {
        const back = from.route.slice(0, -1).reverse();
        back.forEach(([x, y]) => pts.push({ x, y }));
      }
      pts.push({ x: cfg.hub.x, y: cfg.hub.y });
    }
    if (stationType === "hub") {
      pts.push(finalPoint || hubPoint());
    } else {
      const st = stationByType[stationType];
      if (bot.at === "hub") pts.push({ x: cfg.hub.x, y: cfg.hub.y });
      st.route.forEach(([x, y]) => pts.push({ x, y }));
      if (finalPoint) pts.push(finalPoint);
    }
    bot.path = pts;
  }

  function workSpot(station, bot) {
    const slots = [-24, 24, -48, 48, -72, 72, 0];
    const taken = game.bots.filter((b) => b !== bot && b.quest && b.quest.type === station.type && b.workSlot != null).map((b) => b.workSlot);
    let slot = slots.findIndex((_, i) => !taken.includes(i));
    if (slot < 0) slot = Math.floor(Math.random() * slots.length);
    bot.workSlot = slot;
    const outward = station.door.y > station.y + station.h / 2 ? 6 : -6;
    return { x: station.door.x + slots[slot], y: station.door.y + outward };
  }

  // ---------- quests ----------
  function addQuest(opts) {
    const type = stationByType[opts.type] ? opts.type : "code";
    const difficulty = clamp(parseInt(opts.difficulty, 10) || 1, 1, 3);
    const q = {
      id: newId("q"),
      title: String(opts.title || "Untitled quest").slice(0, 80),
      type,
      difficulty,
      duration: opts.external && opts.duration == null ? null : opts.duration != null ? opts.duration : T.baseQuestSeconds * difficulty,
      progress: 0,
      status: "queued",
      botName: opts.bot || null,
      botId: null,
      createdAt: game.time,
      external: !!opts.external,
      externalId: opts.externalId || null,
      result: null,
      workTime: 0,
    };
    if (q.botName && !findBot(q.botName)) addBot({ name: q.botName, skills: [type], external: q.external });
    game.quests.push(q);
    log(`New quest: "${q.title}"`, "quest");
    emit("quests");
    return q;
  }

  function assignQuests() {
    for (const q of game.quests) {
      if (q.status !== "queued") continue;
      let candidates;
      if (q.botName) {
        const b = findBot(q.botName);
        candidates = b && b.state === "idle" ? [b] : [];
      } else {
        const idle = game.bots.filter((b) => b.state === "idle" && !b.external);
        candidates = idle.filter((b) => b.skills.includes(q.type));
        if (!candidates.length && game.time - q.createdAt > T.offSkillWait) candidates = idle;
      }
      if (!candidates.length) continue;
      candidates.sort((a, b) => b.level - a.level || Math.random() - 0.5);
      startQuest(candidates[0], q);
    }
  }

  function startQuest(bot, q) {
    const st = stationByType[q.type];
    q.status = "walking";
    q.botId = bot.id;
    bot.quest = q;
    bot.state = "walking";
    const skilled = bot.skills.includes(q.type);
    q.effectiveDuration = q.duration == null ? null : (q.duration / (1 + 0.08 * (bot.level - 1))) * (skilled ? 1 : 1.4);
    routeTo(bot, q.type, workSpot(st, bot));
    log(`${bot.name} heads to the ${st.name}`, "move");
    emit("quests");
  }

  function finishQuest(bot, success = true) {
    const q = bot.quest;
    if (!q) return;
    q.status = success ? "done" : "failed";
    q.progress = success ? 1 : q.progress;
    q.finishedAt = game.time;
    const skilled = bot.skills.includes(q.type);
    const xp = Math.round(T.xpPerDifficulty * q.difficulty * (skilled ? 1.5 : 1) * (success ? 1 : 0.25));
    const gold = success ? T.goldPerDifficulty * q.difficulty : 0;
    bot.xp += xp;
    bot.gold += gold;
    game.gold += gold;
    if (success) {
      bot.done++;
      game.completed++;
      floatText(bot.x, bot.y - 30, `+${xp} XP`, "#ffe27a");
      if (gold) floatText(bot.x + 10, bot.y - 44, `+${gold}g`, "#ffd24a", 0.3);
      burst(bot.x, bot.y - 12, stationByType[q.type].color, 14);
      log(`${bot.name} completed "${q.title}"`, "done");
    } else {
      floatText(bot.x, bot.y - 30, "✖ failed", "#ff6b6b");
      log(`${bot.name} failed "${q.title}"`, "fail");
    }
    while (bot.xp >= xpForLevel(bot.level)) {
      bot.xp -= xpForLevel(bot.level);
      bot.level++;
      burst(bot.x, bot.y - 12, "#ffe27a", 36, true);
      floatText(bot.x, bot.y - 58, `LEVEL ${bot.level}!`, "#fff", 0.1, 2.6);
      log(`★ ${bot.name} reached level ${bot.level}!`, "level");
      emit("levelup", bot);
    }
    bot.quest = null;
    bot.workSlot = null;
    bot.state = "returning";
    routeTo(bot, "hub");
    emit("quests");
    emit("roster");
    // Trim finished quests so the board doesn't grow forever.
    const finished = game.quests.filter((x) => x.status === "done" || x.status === "failed");
    if (finished.length > 30) {
      const drop = new Set(finished.slice(0, finished.length - 30));
      game.quests = game.quests.filter((x) => !drop.has(x));
    }
  }

  // Called by the feed for externally-reported results.
  function resolveExternal(externalId, botName, success, progress) {
    let q = game.quests.find((x) => x.externalId && x.externalId === externalId && x.status !== "done" && x.status !== "failed");
    if (!q && botName) {
      const b = findBot(botName);
      q = game.quests.find((x) => x.botName && b && x.botName.toLowerCase() === b.name.toLowerCase() && x.external && (x.status === "queued" || x.status === "walking" || x.status === "active"));
    }
    if (!q) return false;
    if (progress != null) {
      q.reportedProgress = clamp(progress, 0, 1);
      return true;
    }
    q.result = success ? "success" : "failure";
    if (q.status === "queued") {
      // Never picked up visually — resolve immediately.
      q.status = success ? "done" : "failed";
      emit("quests");
    }
    return true;
  }

  // ---------- particles ----------
  function floatText(x, y, text, color, delay = 0, life = 1.8) {
    game.particles.push({ kind: "text", x, y, vx: 0, vy: -18, life, max: life, delay, text, color });
  }
  function burst(x, y, color, n, star = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(30, star ? 140 : 90);
      game.particles.push({ kind: star ? "star" : "dot", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 160, life: rand(0.5, 1.1), max: 1.1, color, size: rand(1.5, 3.5) });
    }
  }
  const WORK_FX = {
    code: ["#ffb347", "#ffd27a", "#ff7b3a"],
    review: ["#c6b6ff", "#ffffff"],
    research: ["#bfe0ff", "#ffffff"],
    deploy: ["#8ff0e4", "#ffffff"],
    writing: ["#ffe27a", "#ffb8d9", "#b6f0a0"],
  };
  function workParticles(bot, dt) {
    bot.fxAcc = (bot.fxAcc || 0) + dt;
    if (bot.fxAcc < 0.12) return;
    bot.fxAcc = 0;
    const type = bot.quest.type;
    const color = pick(WORK_FX[type] || ["#fff"]);
    if (type === "research" || type === "writing") {
      game.particles.push({ kind: type === "research" ? "page" : "note", x: bot.x + rand(-8, 8), y: bot.y - 26, vx: rand(-10, 10), vy: rand(-30, -18), life: 1.2, max: 1.2, color });
    } else {
      game.particles.push({ kind: "dot", x: bot.x + bot.facing * 10, y: bot.y - 10, vx: rand(-50, 50), vy: rand(-80, -30), g: 180, life: rand(0.3, 0.7), max: 0.7, color, size: rand(1, 2.5) });
    }
  }

  // ---------- simulation ----------
  function update(dt) {
    game.time += dt;

    // Demo mode keeps the village busy.
    if (game.demo && game.time >= game.nextDemoAt) {
      const open = game.quests.filter((q) => q.status === "queued").length;
      if (open < 6) {
        const type = pick(cfg.stations).type;
        const r = Math.random();
        addQuest({ title: pick(cfg.demoQuests[type]), type, difficulty: r < 0.55 ? 1 : r < 0.88 ? 2 : 3 });
      }
      game.nextDemoAt = game.time + rand(T.demoSpawnEvery[0], T.demoSpawnEvery[1]);
    }

    assignQuests();

    for (const bot of game.bots) {
      bot.walkT += dt;
      if (bot.path.length) {
        const tgt = bot.path[0];
        const dx = tgt.x - bot.x, dy = tgt.y - bot.y;
        const d = Math.hypot(dx, dy);
        const step = bot.speed * dt * (bot.state === "idle" ? 0.45 : 1);
        if (Math.abs(dx) > 0.5) bot.facing = dx > 0 ? 1 : -1;
        if (d <= step) {
          bot.x = tgt.x; bot.y = tgt.y;
          bot.path.shift();
        } else {
          bot.x += (dx / d) * step;
          bot.y += (dy / d) * step;
        }
        bot.moving = true;
      } else {
        bot.moving = false;
      }

      if (bot.state === "walking" && !bot.path.length) {
        bot.state = "working";
        bot.at = bot.quest.type;
        bot.quest.status = "active";
        bot.facing = 1;
        emit("quests");
      } else if (bot.state === "working") {
        const q = bot.quest;
        q.workTime += dt;
        workParticles(bot, dt);
        if (q.effectiveDuration != null) {
          q.progress = clamp(q.workTime / q.effectiveDuration, 0, 1);
          if (q.progress >= 1) finishQuest(bot, true);
        } else {
          // External quest: show reported progress (or a pulse) until the feed resolves it.
          q.progress = q.reportedProgress != null ? q.reportedProgress : null;
          if (q.result && q.workTime > 1.5) finishQuest(bot, q.result === "success");
        }
      } else if (bot.state === "returning" && !bot.path.length) {
        bot.state = "idle";
        bot.at = "hub";
        bot.wanderAt = game.time + rand(1, 3);
        emit("roster");
      } else if (bot.state === "idle" && !bot.path.length && game.time >= bot.wanderAt) {
        bot.path = [hubPoint()];
        bot.wanderAt = game.time + rand(2, 6);
      }
    }

    for (const p of game.particles) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
    }
    game.particles = game.particles.filter((p) => p.life > 0);
  }

  // ---------- background (drawn once) ----------
  let bg = null;
  const BG_SCALE = 2;

  function renderBackground() {
    bg = document.createElement("canvas");
    bg.width = W * BG_SCALE;
    bg.height = H * BG_SCALE;
    const c = bg.getContext("2d");
    c.scale(BG_SCALE, BG_SCALE);
    const rnd = seeded(42);

    // Grass
    const TILE = 32;
    for (let ty = 0; ty < H / TILE; ty++) {
      for (let tx = 0; tx < W / TILE; tx++) {
        c.fillStyle = (tx + ty) % 2 ? "#5d9c4a" : "#62a24e";
        c.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    for (let i = 0; i < 900; i++) {
      c.fillStyle = rnd() < 0.5 ? "#6fb25a" : "#548f42";
      c.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 2, 3);
    }

    // Pond
    c.fillStyle = "#3f7fb5";
    roundRect(c, 390, 548, 180, 70, 30); c.fill();
    c.fillStyle = "#5a9bd0";
    roundRect(c, 400, 556, 160, 54, 24); c.fill();
    c.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 6; i++) c.fillRect(420 + rnd() * 110, 566 + rnd() * 34, 10, 2);

    // Roads
    const roads = [
      [200, 340, 760, 340],
      [480, 180, 480, 340],
      [200, 232, 200, 460],
      [760, 232, 760, 460],
    ];
    c.lineCap = "round";
    c.strokeStyle = "#a7865a"; c.lineWidth = 34;
    roads.forEach(([x1, y1, x2, y2]) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); });
    c.strokeStyle = "#d8b98a"; c.lineWidth = 28;
    roads.forEach(([x1, y1, x2, y2]) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); });
    for (let i = 0; i < 260; i++) {
      const [x1, y1, x2, y2] = roads[Math.floor(rnd() * roads.length)];
      const t = rnd();
      c.fillStyle = rnd() < 0.5 ? "#c9a878" : "#e6c99c";
      c.fillRect(x1 + (x2 - x1) * t + (rnd() - 0.5) * 22, y1 + (y2 - y1) * t + (rnd() - 0.5) * 22, 3, 2);
    }

    // Plaza
    const { x: hx, y: hy, r: hr } = cfg.hub;
    c.fillStyle = "#8f8a80";
    c.beginPath(); c.arc(hx, hy, hr + 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#bdb6a8";
    c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#a59e90"; c.lineWidth = 1;
    for (let r = 14; r < hr; r += 14) { c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2); c.stroke(); }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      c.beginPath(); c.moveTo(hx + Math.cos(a) * 14, hy + Math.sin(a) * 14); c.lineTo(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr); c.stroke();
    }

    // Buildings
    cfg.stations.forEach((s) => drawBuilding(c, s));

    // Trees & flowers, avoiding roads, buildings, plaza and pond.
    const blocked = (x, y, pad) => {
      if (Math.hypot(x - hx, y - hy) < hr + pad + 10) return true;
      if (x > 380 - pad && x < 580 + pad && y > 540 - pad) return true;
      for (const s of cfg.stations) if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return true;
      for (const [x1, y1, x2, y2] of roads) {
        const minx = Math.min(x1, x2) - 20 - pad, maxx = Math.max(x1, x2) + 20 + pad;
        const miny = Math.min(y1, y2) - 20 - pad, maxy = Math.max(y1, y2) + 20 + pad;
        if (x > minx && x < maxx && y > miny && y < maxy) return true;
      }
      return false;
    };
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (blocked(x, y, 4)) continue;
      const fc = ["#ffffff", "#ffd84a", "#ff8fb1", "#b9a4ff"][Math.floor(rnd() * 4)];
      c.fillStyle = fc;
      c.fillRect(x, y, 3, 3); c.fillRect(x + 5, y + 2, 3, 3); c.fillRect(x + 2, y + 5, 3, 3);
    }
    const trees = [];
    for (let i = 0; i < 160 && trees.length < 46; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (blocked(x, y, 16) || trees.some((t) => Math.hypot(t.x - x, t.y - y) < 30)) continue;
      trees.push({ x, y, s: 0.8 + rnd() * 0.5 });
    }
    trees.sort((a, b) => a.y - b.y).forEach((t) => drawTree(c, t.x, t.y, t.s));
    cfg.stations.forEach((s) => drawNamePlate(c, s));

    // Quest board on the plaza's north edge
    c.fillStyle = "#5a3b22"; c.fillRect(hx - 22, hy - hr + 8, 4, 22); c.fillRect(hx + 18, hy - hr + 8, 4, 22);
    c.fillStyle = "#8a5a33"; roundRect(c, hx - 28, hy - hr - 4, 56, 24, 3); c.fill();
    c.fillStyle = "#f3e2b8"; c.fillRect(hx - 22, hy - hr, 12, 14); c.fillRect(hx - 6, hy - hr + 2, 12, 12); c.fillRect(hx + 10, hy - hr, 12, 15);
    c.fillStyle = "#c0392b"; c.fillRect(hx - 17, hy - hr, 2, 2); c.fillRect(hx - 1, hy - hr + 2, 2, 2); c.fillRect(hx + 15, hy - hr, 2, 2);
  }

  function drawTree(c, x, y, s) {
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.beginPath(); c.ellipse(x, y + 12 * s, 14 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#6b4a2b"; c.fillRect(x - 3 * s, y, 6 * s, 12 * s);
    c.fillStyle = "#2f6b33"; c.beginPath(); c.arc(x, y - 6 * s, 15 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#3d8a3f"; c.beginPath(); c.arc(x - 3 * s, y - 9 * s, 11 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#56a84f"; c.beginPath(); c.arc(x - 6 * s, y - 13 * s, 5 * s, 0, Math.PI * 2); c.fill();
  }

  function drawBuilding(c, s) {
    const { x, y, w, h } = s;
    const doorTop = s.door.y < y + h / 2;
    // shadow
    c.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(c, x + 6, y + 8, w, h, 6); c.fill();
    // walls (visible lip)
    c.fillStyle = shade(s.color, -0.12);
    roundRect(c, x, y, w, h, 6); c.fill();
    // roof, top-down with shingles
    c.fillStyle = s.roof;
    roundRect(c, x + 5, y + 5, w - 10, h - 16, 5); c.fill();
    c.strokeStyle = shade(s.roof, 0.08); c.lineWidth = 2;
    for (let yy = y + 14; yy < y + h - 14; yy += 9) { c.beginPath(); c.moveTo(x + 9, yy); c.lineTo(x + w - 9, yy); c.stroke(); }
    c.fillStyle = shade(s.roof, 0.18);
    c.fillRect(x + 5, y + (h - 11) / 2, w - 10, 4); // ridge
    // chimney / tower cap
    if (s.type === "code") { c.fillStyle = "#6b6b6b"; c.fillRect(x + w - 40, y + 14, 16, 22); c.fillStyle = "#3a3a3a"; c.fillRect(x + w - 38, y + 14, 12, 5); }
    if (s.type === "review") { c.fillStyle = shade(s.roof, 0.25); c.beginPath(); c.arc(x + w / 2, y + 40, 22, 0, Math.PI * 2); c.fill(); c.fillStyle = s.roof; c.beginPath(); c.arc(x + w / 2, y + 40, 15, 0, Math.PI * 2); c.fill(); }
    if (s.type === "deploy") { c.fillStyle = "#6b4a2b"; for (let i = 0; i < 4; i++) c.fillRect(x - 18, y + 20 + i * 24, 18, 14); c.fillStyle = "#3f7fb5"; c.fillRect(0, y + 10, x - 18, h - 10); c.fillStyle = "rgba(255,255,255,.4)"; c.fillRect(20, y + 40, 30, 2); c.fillRect(50, y + 80, 22, 2); }
    // emblem
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.beginPath(); c.arc(x + w / 2, y + h / 2 - 6 + (s.type === "review" ? 20 : 0), 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = s.roof;
    c.font = `18px ${FONT}`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(s.icon, x + w / 2, y + h / 2 - 5 + (s.type === "review" ? 20 : 0));
    // door notch on the side facing the road
    c.fillStyle = "#3b2616";
    const dy = doorTop ? y - 2 : y + h - 10;
    roundRect(c, s.door.x - 12, dy, 24, 12, 3); c.fill();
    c.fillStyle = "#c9a15a"; c.fillRect(s.door.x + 5, dy + 5, 2, 2);
  }

  function drawNamePlate(c, s) {
    const { x, y, w, h } = s;
    const doorTop = s.door.y < y + h / 2;
    c.font = `8px ${FONT}`;
    const tw = c.measureText(s.name).width + 14;
    const py = doorTop ? y + h + 4 : y - 18;
    const px = s.type === "review" ? x + w + 8 : x + w / 2 - tw / 2;
    c.fillStyle = "rgba(20,16,30,0.82)";
    roundRect(c, px, s.type === "review" ? y + h - 40 : py, tw, 15, 4); c.fill();
    c.fillStyle = "#fff";
    c.textAlign = "left";
    c.fillText(s.name, px + 7, (s.type === "review" ? y + h - 40 : py) + 8);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- sprites ----------
  function drawBot(c, bot, t) {
    const bob = bot.moving ? Math.abs(Math.sin(bot.walkT * 10)) * 2 : bot.state === "working" ? Math.abs(Math.sin(t * 8)) * 1.5 : Math.sin(t * 2 + bot.walkT) * 0.6;
    const x = Math.round(bot.x), y = bot.y;
    const selected = game.selectedBotId === bot.id;

    // shadow
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath(); c.ellipse(x, y + 1, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
    if (selected) {
      c.strokeStyle = "#ffe27a"; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y + 1, 14, 6, 0, 0, Math.PI * 2); c.stroke();
    }

    const by = y - 6 - bob;
    // legs
    const leg = bot.moving ? Math.sin(bot.walkT * 10) * 2.5 : 0;
    c.fillStyle = shade(bot.color, -0.35);
    c.fillRect(x - 5, by, 3, 5 + leg * 0.4);
    c.fillRect(x + 2, by, 3, 5 - leg * 0.4);
    // body
    c.fillStyle = shade(bot.color, -0.15);
    roundRect(c, x - 8, by - 10, 16, 12, 3); c.fill();
    c.fillStyle = bot.color;
    roundRect(c, x - 8, by - 11, 16, 10, 3); c.fill();
    // arms
    const arm = bot.state === "working" ? Math.sin(t * 14) * 3 : leg;
    c.fillStyle = shade(bot.color, -0.25);
    c.fillRect(x - 11, by - 8 + arm * 0.5, 3, 6);
    c.fillRect(x + 8, by - 8 - arm * 0.5, 3, 6);
    // head
    c.fillStyle = bot.color;
    roundRect(c, x - 9, by - 25, 18, 14, 4); c.fill();
    c.fillStyle = shade(bot.color, 0.15);
    c.fillRect(x - 7, by - 24, 14, 2);
    // face screen
    c.fillStyle = "#1d1a26";
    roundRect(c, x - 7, by - 22, 14, 8, 2); c.fill();
    // eyes (blink)
    const blinking = (t + bot.walkT) % 4 < 0.12;
    c.fillStyle = bot.state === "working" ? "#ffe27a" : "#9ff7ff";
    const ex = bot.facing * 1.5;
    if (blinking) {
      c.fillRect(x - 4 + ex, by - 18, 3, 1); c.fillRect(x + 1 + ex, by - 18, 3, 1);
    } else {
      c.fillRect(x - 4 + ex, by - 20, 2, 3); c.fillRect(x + 2 + ex, by - 20, 2, 3);
    }
    // antenna
    c.fillStyle = shade(bot.color, -0.3);
    c.fillRect(x - 0.5, by - 30, 1.5, 5);
    const glow = 0.6 + Math.sin(t * 4 + bot.walkT) * 0.4;
    c.fillStyle = bot.state === "working" ? `rgba(255,226,122,${glow})` : `rgba(159,247,255,${glow})`;
    c.beginPath(); c.arc(x + 0.25, by - 31, 2.2, 0, Math.PI * 2); c.fill();
    // level badge
    c.fillStyle = "#1d1a26";
    roundRect(c, x + 6, by - 29, 11, 8, 2); c.fill();
    c.fillStyle = "#ffe27a";
    c.font = `6px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(bot.level, x + 11.5, by - 24.6);
  }

  function drawLabel(c, bot, t) {
    const x = bot.x, y = bot.y - 42;
    c.font = `7px ${FONT}`;
    c.textAlign = "center"; c.textBaseline = "middle";
    const tw = c.measureText(bot.name).width + 8;
    c.fillStyle = "rgba(20,16,30,0.7)";
    roundRect(c, x - tw / 2, y - 5, tw, 10, 3); c.fill();
    c.fillStyle = "#fff";
    c.fillText(bot.name, x, y + 0.5);

    const q = bot.quest;
    if (!q) return;
    if (bot.state === "working") {
      // progress bar
      const bw = 30, bx = x - bw / 2, byy = y + 7;
      c.fillStyle = "rgba(20,16,30,0.8)"; c.fillRect(bx - 1, byy - 1, bw + 2, 5);
      c.fillStyle = stationByType[q.type].color;
      if (q.progress == null) {
        const p = (t * 0.6) % 1;
        c.fillRect(bx + p * (bw - 10), byy, 10, 3);
      } else {
        c.fillRect(bx, byy, bw * q.progress, 3);
      }
    }
    if (game.selectedBotId === bot.id || bot.state === "walking") {
      // speech bubble with the quest title
      c.font = `6px ${FONT}`;
      const text = q.title.length > 28 ? q.title.slice(0, 27) + "…" : q.title;
      const w = c.measureText(text).width + 10;
      const bx = clamp(x - w / 2, 4, W - w - 4), byy = y - 22;
      c.fillStyle = "rgba(255,255,255,0.95)";
      roundRect(c, bx, byy, w, 13, 4); c.fill();
      c.beginPath(); c.moveTo(x - 3, byy + 13); c.lineTo(x + 3, byy + 13); c.lineTo(x, byy + 17); c.fill();
      c.fillStyle = "#1d1a26";
      c.fillText(text, bx + w / 2, byy + 7);
    }
  }

  function drawParticle(c, p) {
    if (p.delay > 0) return;
    const a = clamp(p.life / p.max, 0, 1);
    c.globalAlpha = a;
    if (p.kind === "text") {
      c.font = `8px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = "rgba(0,0,0,0.6)"; c.fillText(p.text, p.x + 1, p.y + 1);
      c.fillStyle = p.color; c.fillText(p.text, p.x, p.y);
    } else if (p.kind === "page") {
      c.fillStyle = p.color; c.fillRect(p.x - 3, p.y - 4, 6, 8);
      c.fillStyle = "#7a9cc0"; c.fillRect(p.x - 2, p.y - 2, 4, 1); c.fillRect(p.x - 2, p.y, 4, 1);
    } else if (p.kind === "note") {
      c.font = `8px ${FONT}`; c.fillStyle = p.color; c.textAlign = "center"; c.fillText("✦", p.x, p.y);
    } else if (p.kind === "star") {
      c.fillStyle = p.color; c.fillRect(p.x - p.size, p.y - 0.5, p.size * 2, 1.5); c.fillRect(p.x - 0.5, p.y - p.size, 1.5, p.size * 2);
    } else {
      c.fillStyle = p.color; c.fillRect(p.x, p.y, p.size, p.size);
    }
    c.globalAlpha = 1;
  }

  // Chimney smoke / glowing windows when a station is busy.
  function drawStationFx(c, t) {
    for (const s of cfg.stations) {
      const busy = game.bots.some((b) => b.state === "working" && b.quest && b.quest.type === s.type);
      if (!busy) continue;
      c.strokeStyle = s.color; c.lineWidth = 2;
      c.globalAlpha = 0.45 + Math.sin(t * 4) * 0.25;
      roundRect(c, s.x - 2, s.y - 2, s.w + 4, s.h + 4, 8); c.stroke();
      c.globalAlpha = 1;
      if (s.type === "code") {
        for (let i = 0; i < 4; i++) {
          const p = ((t * 0.5 + i / 4) % 1);
          c.fillStyle = `rgba(200,200,200,${0.5 * (1 - p)})`;
          c.beginPath(); c.arc(s.x + s.w - 32 + Math.sin(p * 6 + i) * 4, s.y + 12 - p * 40, 4 + p * 8, 0, Math.PI * 2); c.fill();
        }
      }
    }
  }

  // Day / night tint. One day = 4 real minutes at 1x.
  const DAY = 240;
  function dayPhase() { return (game.time / DAY + 0.3) % 1; }
  game.clock = () => {
    const mins = Math.floor(dayPhase() * 24 * 60);
    return { day: Math.floor((game.time / DAY + 0.3)) + 1, h: Math.floor(mins / 60), m: mins % 60 };
  };
  function nightAmount() {
    const p = dayPhase();
    // dark between ~20:00 and ~05:00, with soft edges
    const d = Math.cos((p - 0.02) * Math.PI * 2);
    return clamp((d - 0.25) / 0.75, 0, 1) * 0.45;
  }

  // ---------- render loop ----------
  let canvas, ctx, scale = 1, dpr = 1;

  function resize() {
    const wrap = canvas.parentElement;
    const pad = 12; // canvas border + breathing room
    const maxW = wrap.clientWidth - pad, maxH = (wrap.clientHeight || Infinity) - pad;
    scale = Math.min(maxW / W, maxH / H);
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
  }

  function render() {
    const t = game.time;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bg, 0, 0, W, H);
    drawStationFx(ctx, t);

    const bots = [...game.bots].sort((a, b) => a.y - b.y);
    bots.forEach((b) => drawBot(ctx, b, t));

    const night = nightAmount();
    if (night > 0.01) {
      ctx.fillStyle = `rgba(20,24,70,${night})`;
      ctx.fillRect(0, 0, W, H);
      // lamps: stations and bot antennae glow at night
      ctx.globalCompositeOperation = "lighter";
      for (const s of cfg.stations) {
        const g = ctx.createRadialGradient(s.door.x, s.door.y, 2, s.door.x, s.door.y, 60);
        g.addColorStop(0, `rgba(255,200,120,${night * 0.9})`); g.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = g; ctx.fillRect(s.door.x - 60, s.door.y - 60, 120, 120);
      }
      for (const b of game.bots) {
        const g = ctx.createRadialGradient(b.x, b.y - 30, 1, b.x, b.y - 30, 18);
        g.addColorStop(0, `rgba(160,240,255,${night})`); g.addColorStop(1, "rgba(160,240,255,0)");
        ctx.fillStyle = g; ctx.fillRect(b.x - 18, b.y - 48, 36, 36);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    game.particles.forEach((p) => drawParticle(ctx, p));
    bots.forEach((b) => drawLabel(ctx, b, t));
  }

  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!game.paused) {
      // Sub-step at high speed so movement stays smooth.
      const steps = Math.ceil(game.speed);
      for (let i = 0; i < steps; i++) update((dt * game.speed) / steps);
    }
    render();
    requestAnimationFrame(frame);
  }

  function botAt(wx, wy) {
    let best = null, bd = 18;
    for (const b of game.bots) {
      const d = Math.hypot(b.x - wx, b.y - 14 - wy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function start(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    renderBackground();
    // Re-render once the pixel font has loaded so signs use it.
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`8px "Press Start 2P"`).then(renderBackground).catch(() => {});
    }
    cfg.bots.forEach((b) => addBot(b));
    game.log = [];
    log("The village wakes up. Quests will appear on the board.", "info");
    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const b = botAt((e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
      game.selectedBotId = b ? b.id : null;
      emit("select", b);
    });
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      canvas.style.cursor = botAt((e.clientX - r.left) / scale, (e.clientY - r.top) / scale) ? "pointer" : "default";
    });
    requestAnimationFrame(frame);
  }

  Object.assign(CBE, { start, addBot, addQuest, findBot, resolveExternal, xpForLevel, resize, stationByType });
})();
