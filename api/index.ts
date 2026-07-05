// Vercel serverless entry point. An Express app is itself a (req, res)
// handler, so exporting it lets Vercel run the whole API as one function.
//
// It imports the server as a PRE-BUNDLED plain-JS file (server/dist/app.js,
// produced by esbuild in the build step) rather than the raw .ts source —
// Node can't load .ts at runtime, which is what crashed the function before.
// vercel.json rewrites /api/*, /health, and /ready here; the client is served
// as static files from client/dist by Vercel's CDN.
import app from "../server/dist/app.js";

export default app;
