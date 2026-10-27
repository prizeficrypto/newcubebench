import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api and the health probes to the Express backend so the
// browser only ever talks to one origin (no CORS friction in dev).
//
// cubing.js: excluded from dependency pre-bundling (it uses top-level await
// and its own worker files, which esbuild's es2020 prebundle target rejects) —
// Vite serves its native ESM directly. Build target raised to es2022 to match.
export default defineConfig({
  plugins: [react()],
  // Force a single React instance so packages with their own React dep (e.g.
  // @vercel/analytics) don't get a second copy through the dep optimizer,
  // which otherwise triggers "invalid hook call" errors.
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["cubing"],
  },
  build: {
    target: "es2022",
    // Required for real scrambles in production: Vite's modulepreload helper
    // gets compiled into cubing.js's search-worker chunk, and it touches
    // `document`, which doesn't exist inside a Worker. The worker then fails
    // to start and every scramble silently falls back to random moves.
    // Dev mode never shows this (cubing is served unbundled there).
    modulePreload: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/ready": { target: "http://localhost:4000", changeOrigin: true },
      "/health": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
