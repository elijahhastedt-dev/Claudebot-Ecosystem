// Claudebot Ecosystem — world configuration.
// Edit this file to rename your bots, change their skills, or add quest ideas.
window.CBE = window.CBE || {};

CBE.config = {
  // Logical world size in pixels. The canvas scales to fit the screen.
  world: { width: 960, height: 640 },

  // Each station is a building where one kind of task gets done.
  // `type` is what quests and feed events refer to.
  stations: [
    { type: "code",     name: "Code Forge",       icon: "⚒", color: "#d9774b", roof: "#8c3b22", x: 110, y: 96,  w: 180, h: 120, door: { x: 200, y: 232 }, route: [[200, 340], [200, 232]] },
    { type: "review",   name: "Review Tower",     icon: "✔", color: "#8e7cc3", roof: "#4b3d80", x: 425, y: 24,  w: 110, h: 140, door: { x: 480, y: 180 }, route: [[480, 180]] },
    { type: "research", name: "Research Library", icon: "✎", color: "#5b9bd5", roof: "#2d5c8a", x: 670, y: 96,  w: 180, h: 120, door: { x: 760, y: 232 }, route: [[760, 340], [760, 232]] },
    { type: "deploy",   name: "Deploy Dock",      icon: "⚓", color: "#4fb3a9", roof: "#1f6b64", x: 110, y: 476, w: 180, h: 120, door: { x: 200, y: 460 }, route: [[200, 340], [200, 460]] },
    { type: "writing",  name: "Design Studio",    icon: "✦", color: "#e0b84a", roof: "#8a6a1c", x: 670, y: 476, w: 180, h: 120, door: { x: 760, y: 460 }, route: [[760, 340], [760, 460]] },
  ],

  // The town square in the middle. Idle bots hang out here.
  hub: { x: 480, y: 340, r: 62 },

  // Your Claudebots. `skills` are station types they prefer to work at.
  bots: [
    { name: "Ada",    color: "#d97757", skills: ["code", "review"] },
    { name: "Basil",  color: "#6a9bcc", skills: ["research", "writing"] },
    { name: "Cleo",   color: "#9b7fd1", skills: ["review", "research"] },
    { name: "Dex",    color: "#56b49a", skills: ["deploy", "code"] },
    { name: "Juniper",color: "#e3b341", skills: ["writing", "research"] },
  ],

  // Demo mode spawns quests from this list so the world is never empty.
  demoQuests: {
    code:     ["Refactor auth module", "Fix flaky test", "Add pagination", "Port script to TypeScript", "Squash memory leak", "Build CLI flag parser"],
    review:   ["Review PR: caching layer", "Audit dependency bumps", "Security review", "Check test coverage", "Review API schema"],
    research: ["Survey vector DBs", "Read the RFC", "Benchmark JSON parsers", "Investigate prod incident", "Compare hosting costs"],
    deploy:   ["Ship v2.3.0", "Roll out feature flag", "Rotate TLS certs", "Scale worker pool", "Migrate database"],
    writing:  ["Write release notes", "Draft onboarding docs", "Design landing page", "Update README", "Sketch dashboard UI"],
  },

  // How quickly things happen (seconds of game time).
  tuning: {
    demoSpawnEvery: [4, 9],        // random range between demo quests
    baseQuestSeconds: 8,           // difficulty 1 quest; x2 and x3 for harder ones
    xpPerDifficulty: 40,
    goldPerDifficulty: 15,
    offSkillWait: 12,              // seconds a quest waits for a specialist before anyone may take it
    feedPollMs: 2000,
  },
};
