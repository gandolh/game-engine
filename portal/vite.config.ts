import { defineConfig } from "vite";

// Served at /games in production (PORTAL_BASE=/games/), like the games' own *_BASE.
const base = process.env.PORTAL_BASE ?? "/";

export default defineConfig({
  base,
  server: {
    // Farm 5173, Citadel 5174, Hollow 5175, MateQuest 5176 — the portal takes 5177.
    port: 5177,
  },
  build: {
    // Tracks tsconfig.base.json's "target": "ES2022" — see corpus/wiki/decisions.md.
    target: "es2022",
    sourcemap: true,
  },
});
