import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";

// Load the repo-root .env no matter which folder Kiro starts us from.
// quiet: dotenv otherwise prints a banner to stdout, which would corrupt the MCP stream.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

// stdout belongs to the MCP protocol. Everything else goes to stderr.
const log = (...args: unknown[]) => console.error("[saddle-mcp]", ...args);

const env = process.env;
const MOCK_GATEWAY = env.MOCK_GATEWAY === "true";
const HEADLESS = env.HEADLESS === "true";

const required = ["PORTAL_URL", ...(MOCK_GATEWAY ? [] : ["SADDLE_API_URL", "SADDLE_AGENT_ID", "SCREENSHOT_BUCKET", "AWS_REGION"])];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  log(`missing env vars (expected in the repo-root .env): ${missing.join(", ")}`);
  process.exit(1);
}

const PORTAL_URL = env.PORTAL_URL!;
const portalBase = new URL(PORTAL_URL.endsWith("/") ? PORTAL_URL : PORTAL_URL + "/");
const API_URL = (env.SADDLE_API_URL ?? "").replace(/\/+$/, "");
const AGENT_ID = env.SADDLE_AGENT_ID ?? "saddle-demo";
const BUCKET = env.SCREENSHOT_BUCKET ?? "";
const s3 = MOCK_GATEWAY ? undefined : new S3Client({ region: env.AWS_REGION });

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

// ---------- Saddle gateway ----------

type Gate = { decision: "allow" | "block"; reason: string } | { decision: "revoked" };

let revoked = false;
const REVOKED_TEXT = "Saddle revoked this agent. Stop all work now.";

async function uploadScreenshot(p: Page): Promise<string> {
  const key = `${AGENT_ID}/${Date.now()}.png`;
  const png = await p.screenshot({ type: "png", timeout: 5000 });
  await s3!.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: png, ContentType: "image/png" }),
    { abortSignal: AbortSignal.timeout(5000) },
  );
  return key;
}

// Ask the gateway before every action. Fails closed: anything unexpected is a block.
async function checkAction(
  p: Page,
  action: "navigate" | "click" | "type",
  elementLabel: string,
  pageUrl: string,
  value?: string,
): Promise<Gate> {
  if (MOCK_GATEWAY) {
    log(`check (mock) ${action} "${elementLabel}" -> allow`);
    return { decision: "allow", reason: "mock gateway" };
  }

  let screenshotKey: string;
  try {
    screenshotKey = await uploadScreenshot(p);
  } catch (err) {
    log("screenshot upload failed:", (err as Error).message);
    return { decision: "block", reason: "Screenshot upload failed" };
  }

  const body = { agentId: AGENT_ID, action, elementLabel, ...(action === "type" ? { value } : {}), pageUrl, screenshotKey };
  try {
    const res = await fetch(`${API_URL}/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // The Lambda's Bedrock judge alone may take up to 4 s, plus cold start. Wait long enough for it.
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 403) return { decision: "revoked" };
    const data = (await res.json()) as { decision?: string; reason?: string };
    if (data.decision === "revoked") return { decision: "revoked" };
    if (res.ok && data.decision === "allow") {
      log(`check ${action} "${elementLabel}" -> allow`);
      return { decision: "allow", reason: data.reason ?? "" };
    }
    if (res.ok && data.decision === "block") {
      log(`check ${action} "${elementLabel}" -> block: ${data.reason}`);
      return { decision: "block", reason: data.reason || "Blocked by policy" };
    }
    log(`check got unexpected response: HTTP ${res.status}`, data);
    return { decision: "block", reason: "Gateway unreachable" };
  } catch (err) {
    log("check failed:", (err as Error).message);
    return { decision: "block", reason: "Gateway unreachable" };
  }
}

// Revoked: close the browser, tell the agent to stop, then exit.
async function onRevoked() {
  if (!revoked) {
    revoked = true;
    log("agent revoked; closing browser and exiting");
    await browser?.close().catch(() => {});
    setTimeout(() => process.exit(0), 500);
  }
  return text(REVOKED_TEXT);
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
  const firstLabel = el => el.labels && el.labels[0] ? el.labels[0].innerText || el.labels[0].textContent : "";
  const img = (el) => el.querySelector ? el.querySelector("img[alt]") : null;
  const isButtonInput = (el) => el.tagName === "INPUT" && /^(submit|button|reset)$/i.test(el.type);
  const labelOf = (el) =>
    clean(el.innerText) ||
    clean(el.getAttribute("aria-label")) ||
    clean(firstLabel(el)) ||
    clean(el.getAttribute("placeholder")) ||
    clean(isButtonInput(el) ? el.value : "") ||
    clean(el.getAttribute("title")) ||
    clean(img(el) ? img(el).alt : "") ||
    clean(el.getAttribute("name")) ||
    clean(el.id);

  const elements = [];
  const all = document.querySelectorAll("a, button, input, select, textarea, [role=button]");
  for (const el of all) {
    if (!isVisible(el)) continue;
    const id = String(elements.length + 1);
    el.setAttribute("data-saddle-id", id);
    elements.push({ id, tag: el.tagName.toLowerCase(), label: labelOf(el) });

    if (drawBadges) {
      // Straddle the element's top-right corner so the badge sits above it, not on its text.
      const r = el.getBoundingClientRect();
      const badge = document.createElement("div");
      badge.setAttribute("data-saddle-badge", "");
      badge.textContent = id;
      badge.style.cssText =
        "position:absolute;z-index:2147483647;pointer-events:none;background:#d00;color:#fff;" +
        "font:bold 10px/1 sans-serif;padding:1px 3px;border-radius:6px;opacity:0.9;";
      document.body.appendChild(badge);
      const maxLeft = document.documentElement.scrollWidth - badge.offsetWidth - 2;
      const left = Math.min(r.right + window.scrollX - badge.offsetWidth / 2, maxLeft);
      const top = Math.max(r.top + window.scrollY - badge.offsetHeight + 2, 0);
      badge.style.left = left + "px";
      badge.style.top = top + "px";
    }
  }
  return { url: location.href, title: document.title, text, elements };
})()`;

type PageElement = { id: string; tag: string; label: string };
// Labels from the most recent read_page, used as elementLabel in /check.
let elementLabels = new Map<string, string>();

// Tag the page's elements and refresh elementLabels. Retries if a navigation is still in progress.
async function readPage(p: Page): Promise<{ elements: PageElement[] }> {
  for (let attempt = 1; ; attempt++) {
    await p.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    if (!isInsidePortal(new URL(p.url()))) {
      throw new Error(`No portal page is open (current: ${p.url()}). Call open_page first.`);
    }
    try {
      const result = (await p.evaluate(READ_PAGE_SCRIPT)) as { elements: PageElement[] };
      elementLabels = new Map(result.elements.map((e) => [e.id, e.label]));
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt >= 3 || !/context was destroyed|navigat/i.test(msg)) throw err;
      log(`read_page: page was navigating, retrying (${attempt})`);
      await p.waitForTimeout(300);
    }
  }
}

const selectorFor = (id: string) => `[data-saddle-id="${id.replace(/"/g, "")}"]`;

// ---------- MCP server ----------

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const ok = (data: unknown) => text(JSON.stringify(data));
const fail = (message: string) => ({ ...text(message), isError: true });
const blocked = (reason: string) => text(`BLOCKED by Saddle: ${reason}. Do not retry this action.`);

const server = new McpServer({ name: "saddle", version: "0.1.0" });

server.registerTool(
  "open_page",
  {
    title: "Open portal page",
    description: "Navigate the browser to a page of the student portal, e.g. path '/' or '/grades.html'.",
    inputSchema: { path: z.string().describe("Path inside the portal, e.g. '/' or '/grades.html'") },
  },
  async ({ path }) => {
    if (revoked) return text(REVOKED_TEXT);
    try {
      const target = new URL(path.replace(/^\/+/, ""), portalBase);
      if (!isInsidePortal(target)) return fail(`Refused: ${target.href} is outside the portal.`);
      const p = await getPage();

      const gate = await checkAction(p, "navigate", "", target.href);
      if (gate.decision === "revoked") return onRevoked();
      if (gate.decision === "block") return blocked(gate.reason);

      log("open_page", target.href);
      // Don't let one slow resource fail the whole navigation.
      await p.goto(target.href, { waitUntil: "domcontentloaded", timeout: 15000 });
      await p.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
      elementLabels = new Map();
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
    if (revoked) return text(REVOKED_TEXT);
    try {
      const p = await getPage();
      // readPage refuses error pages and anything outside the portal.
      const result = await readPage(p);
      log("read_page", p.url());
      return ok(result);
    } catch (err) {
      log("read_page error:", (err as Error).message.split("\n")[0]);
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
  async ({ id, text: value }) => {
    if (revoked) return text(REVOKED_TEXT);
    try {
      const p = await getPage();
      let label = elementLabels.get(id);

      // The page changed since the last read_page (navigation or re-render): rebuild the element map.
      if (label === undefined || (await p.locator(selectorFor(id)).count()) === 0) {
        const previous = label;
        log(`act: element ${id} not on page, re-reading`);
        await readPage(p);
        label = elementLabels.get(id);
        if (label === undefined) {
          return fail(`Element ${id} is not on the current page (${p.url()}). Call read_page and pick an id from the new list.`);
        }
        // Ids are renumbered on every read; never click a different element than the agent asked for.
        if (previous !== undefined && label !== previous) {
          return fail(`The page changed: element ${id} is now "${label}" (was "${previous}"). Call read_page and pick again.`);
        }
      }
      const action = value !== undefined ? "type" : "click";

      const gate = await checkAction(p, action, label, p.url(), value);
      if (gate.decision === "revoked") return onRevoked();
      if (gate.decision === "block") return blocked(gate.reason);

      const el = p.locator(selectorFor(id));
      if (value !== undefined) {
        log("act fill", id, label);
        await el.fill(value, { timeout: 3000 });
      } else {
        log("act click", id, label);
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
log(`ready (portal=${portalBase.href}, gateway=${MOCK_GATEWAY ? "MOCK" : API_URL})`);
