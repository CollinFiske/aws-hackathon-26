// Serves the static demo portal (../portal) at PORTAL_URL. No dependencies beyond dotenv.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const portalUrl = new URL(process.env.PORTAL_URL ?? "");
const root = fileURLToPath(new URL("../../portal/", import.meta.url));
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url ?? "/", portalUrl).pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(root, rel);
    if (!file.startsWith(root)) return res.writeHead(403).end("Forbidden");
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(Number(portalUrl.port || 80), portalUrl.hostname, () => {
    console.log(`Demo portal: serving ${root} at ${portalUrl.href}`);
  });
