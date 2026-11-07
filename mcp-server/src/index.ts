import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";

// Load the repo-root .env no matter which folder Kiro starts us from.
// quiet: dotenv otherwise prints a banner to stdout, which would corrupt the MCP stream.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

// stdout belongs to the MCP protocol. Everything else goes to stderr.
const log = (...args: unknown[]) => console.error("[saddle-mcp]", ...args);

const PORTAL_URL = process.env.PORTAL_URL;
if (!PORTAL_URL) {
  log("PORTAL_URL is not set (expected in the repo-root .env)");
  process.exit(1);
}
const portalBase = new URL(PORTAL_URL.endsWith("/") ? PORTAL_URL : PORTAL_URL + "/");
const HEADLESS = process.env.HEADLESS === "true";

// ---------- browser (launched on first tool call) ----------

let browser: Browser | undefined;
let page: Page | undefined;

async function getPage(): Promise<Page> {
  if (page && !page.isClosed() && browser?.isConnected()) return page;
  if (!browser?.isConnected()) {
    log(`launching chromium (headless=${HEADLESS})`);
    browser = await chromium.launch({ headless: HEADLESS });
  }
  page = await browser.newPage();
  return page;
}

function isInsidePortal(url: URL): boolean {
  return url.origin === portalBase.origin && url.pathname.startsWith(portalBase.pathname);
}

// ---------- in-page script for read_page ----------
// Kept as a string so tsx/esbuild can't inject helpers (like __name) that don't exist in the browser.
const READ_PAGE_SCRIPT = `(() => {
  const drawBadges = ${!HEADLESS};
  document.querySelectorAll("[data-saddle-badge]").forEach((b) => b.remove());
  document.querySelectorAll("[data-saddle-id]").forEach((e) => e.removeAttribute("data-saddle-id"));

  const clean = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const text = clean(document.body ? document.body.textContent : "").slice(0, 4000);

  const isVisible = (el) => {
    if (el.getClientRects().length === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };
  const labelOf = (el) =>
    clean(el.innerText) ||
    clean(el.getAttribute("aria-label")) ||
    clean(el.labels && el.labels[0] ? el.labels[0].innerText : "") ||
    clean(el.getAttribute("placeholder")) ||
    clean(el.getAttribute("name"));

  const elements = [];
  const all = document.querySelectorAll("a, button, input, select, textarea, [role=button]");
  for (const el of all) {
    if (!isVisible(el)) continue;
    const id = String(elements.length + 1);
    el.setAttribute("data-saddle-id", id);
    elements.push({ id, tag: el.tagName.toLowerCase(), label: labelOf(el) });

    if (drawBadges) {
      const r = el.getBoundingClientRect();
      const badge = document.createElement("div");
      badge.setAttribute("data-saddle-badge", "");
      badge.textContent = id;
      badge.style.cssText =
        "position:absolute;z-index:2147483647;pointer-events:none;background:#d00;color:#fff;" +
        "font:bold 11px/1 sans-serif;padding:2px 4px;border-radius:8px;" +
        "left:" + (r.left + window.scrollX - 6) + "px;top:" + (r.top + window.scrollY - 6) + "px;";
      document.body.appendChild(badge);
    }
  }
  return { url: location.href, title: document.title, text, elements };
})()`;

// ---------- MCP server ----------

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const server = new McpServer({ name: "saddle", version: "0.1.0" });

server.registerTool(
  "open_page",
  {
    title: "Open portal page",
    description: "Navigate the browser to a page of the student portal, e.g. path '/' or '/grades.html'.",
    inputSchema: { path: z.string().describe("Path inside the portal, e.g. '/' or '/grades.html'") },
  },
  async ({ path }) => {
    try {
      const target = new URL(path.replace(/^\/+/, ""), portalBase);
      if (!isInsidePortal(target)) return fail(`Refused: ${target.href} is outside the portal.`);
      const p = await getPage();
      log("open_page", target.href);
      await p.goto(target.href, { waitUntil: "load" });
      return ok({ url: p.url(), title: await p.title() });
    } catch (err) {
      const msg = (err as Error).message;
      log("open_page error:", msg.split("\n")[0]);
      if (msg.includes("ERR_CONNECTION_REFUSED")) {
        return fail(`open_page failed: the portal is not reachable at ${portalBase.href}. Is it running?`);
      }
      return fail(`open_page failed: ${msg}`);
    }
  },
);

server.registerTool(
  "read_page",
  {
    title: "Read current page",
    description:
      "Return the current page's url, title, text and a numbered list of interactive elements. " +
      "Use the element ids with the act tool. Ids change every time you call read_page.",
    inputSchema: {},
  },
  async () => {
    try {
      const p = await getPage();
      // Never hand the agent error pages or anything outside the portal.
      if (!isInsidePortal(new URL(p.url()))) {
        return fail(`No portal page is open (current: ${p.url()}). Call open_page first.`);
      }
      const result = await p.evaluate(READ_PAGE_SCRIPT);
      log("read_page", p.url());
      return ok(result);
    } catch (err) {
      log("read_page error", err);
      return fail(`read_page failed: ${(err as Error).message}`);
    }
  },
);

server.registerTool(
  "act",
  {
    title: "Act on an element",
    description:
      "Click an element by its id from read_page. If text is given, fill that input with the text instead (no Enter).",
    inputSchema: {
      id: z.string().describe("Element id from the last read_page call"),
      text: z.string().optional().describe("Text to fill into the element. Omit to click."),
    },
  },
  async ({ id, text }) => {
    try {
      const p = await getPage();
      const el = p.locator(`[data-saddle-id="${id.replace(/"/g, "")}"]`);
      if (text !== undefined) {
        log("act fill", id);
        await el.fill(text, { timeout: 3000 });
      } else {
        log("act click", id);
        await el.click({ timeout: 3000 });
      }
      await p.waitForLoadState("load", { timeout: 3000 }).catch(() => {});
      return ok({ ok: true, url: p.url() });
    } catch (err) {
      log("act error", err);
      return fail(`act failed: ${(err as Error).message}`);
    }
  },
);

// ---------- start / shutdown ----------

async function shutdown() {
  log("shutting down");
  await browser?.close().catch(() => {});
  process.exit(0);
}
process.stdin.on("close", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
log(`ready (portal=${portalBase.href})`);
