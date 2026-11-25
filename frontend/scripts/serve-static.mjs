// Minimal static server for the exported site (frontend/out), mounted at BASE_PATH.
// Used by the Playwright tests; no dependencies.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const base = (process.env.BASE_PATH ?? "").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 4310);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon" };

createServer((req, res) => {
  let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) file = join(root, "404.html");
  res.writeHead(existsSync(file) && file.endsWith("404.html") && !path.endsWith("404.html") ? 404 : 200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}${base}/`));
