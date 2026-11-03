// Serve the built portal and the four built games from ONE origin, the way production does, so
// the portal's frames are same-origin: /games/ (portal/dist), /farm-valley/, /citadel/, /hollow/,
// /mathquest/ (each game's client/dist, built with its *_BASE), and Farm's sim socket at
// /farm-valley/sim, proxied to the Farm server on :8787 (start it with `npm run server`).
//
//   PORT=8090 node scripts/serve-all.mjs
//
// Build first (from the repo root):
//   FARM_VALLEY_BASE=/farm-valley/ npm run build -w @farm/client
//   CITADEL_BASE=/citadel/ npm run build -w @citadel/client
//   HOLLOW_BASE=/hollow/ npm run build -w @hollow/client
//   MATHQUEST_BASE=/mathquest/ npm run build -w @mathquest/client
//   PORTAL_BASE=/games/ npm run build -w @game-engine/portal
import { createServer } from "node:http";
import { connect } from "node:net";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SITES = {
  "/games/": join(ROOT, "portal", "dist"),
  "/farm-valley/": join(ROOT, "games", "farm", "client", "dist"),
  "/citadel/": join(ROOT, "games", "citadel", "client", "dist"),
  "/hollow/": join(ROOT, "games", "hollow", "client", "dist"),
  "/mathquest/": join(ROOT, "games", "mathquest", "client", "dist"),
};
const SIM_PATH = "/farm-valley/sim";
const SIM_PORT = Number(process.env.SIM_PORT ?? 8787);
const PORT = Number(process.env.PORT ?? 8090);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

for (const [prefix, dir] of Object.entries(SITES)) {
  if (!existsSync(join(dir, "index.html"))) console.warn(`[serve-all] ${prefix} has no build at ${dir}`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const prefix = Object.keys(SITES).find((p) => url.pathname === p.slice(0, -1) || url.pathname.startsWith(p));
  if (!prefix) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  if (url.pathname === prefix.slice(0, -1)) {
    res.writeHead(301, { location: prefix }).end();
    return;
  }
  const dir = SITES[prefix];
  const rel = decodeURIComponent(url.pathname.slice(prefix.length));
  let file = normalize(join(dir, rel));
  if (!file.startsWith(dir + sep) && file !== dir) {
    res.writeHead(403).end();
    return;
  }
  // A path with no file is a page of the single-page app: serve its index, as the deploy does.
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not built");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

// Farm's socket: forward the upgrade to the sim server with the prefix stripped, then pipe both ways.
server.on("upgrade", (req, socket, head) => {
  if (!(req.url ?? "").startsWith(SIM_PATH)) {
    socket.destroy();
    return;
  }
  const upstream = connect(SIM_PORT, "127.0.0.1", () => {
    const path = (req.url ?? "").slice("/farm-valley".length) || "/";
    const lines = [`${req.method} ${path} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, () => {
  console.log(`[serve-all] http://localhost:${PORT}/games/ (Farm's sim proxied to :${SIM_PORT})`);
});
