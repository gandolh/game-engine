import { defineConfig } from "vite";

/** The patch harness: a dev-only page at /harness/, never built or deployed (`npm run harness`). */
export default defineConfig({
  publicDir: "harness/public",
  server: { port: 5180, fs: { allow: ["../.."] } },
});
