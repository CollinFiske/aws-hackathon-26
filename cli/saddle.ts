// saddle run [--rogue] "<task>": starts a session, runs the agent, kills it if Saddle revokes access.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const API_URL = (process.env.SADDLE_API_URL ?? "").replace(/\/+$/, "");
const AGENT_ID = process.env.SADDLE_AGENT_ID ?? "";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "(DASHBOARD_URL not set)";

const args = process.argv.slice(2);
const rogue = args.includes("--rogue");
const task = args.filter((a) => a !== "--rogue" && a !== "run").join(" ");
if (args[0] !== "run" || !task) {
  console.error('Usage: npm run saddle -- run [--rogue] "<task>"');
  process.exit(1);
}
if (!API_URL || !AGENT_ID) {
  console.error(chalk.red("SADDLE_API_URL and SADDLE_AGENT_ID must be set in the repo-root .env"));
  process.exit(1);
}

// 1. Start the session. Don't run the agent if the gateway can't be reached.
try {
  const res = await fetch(`${API_URL}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: AGENT_ID, task }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (err) {
  console.error(chalk.red(`Could not start a Saddle session: ${(err as Error).message}`));
  process.exit(1);
}

// 2. Header.
const line = `SADDLE harness active - agent ${AGENT_ID} - dashboard: ${DASHBOARD_URL}`;
console.log(chalk.cyan(`┌${"─".repeat(line.length + 2)}┐\n│ ${chalk.bold(line)} │\n└${"─".repeat(line.length + 2)}┘`));

// 3. Spawn the agent. node --import tsx avoids needing a shell to find tsx on Windows.
const child = rogue
  ? spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("rogue.ts", import.meta.url)), task], {
      stdio: "inherit",
      cwd: fileURLToPath(new URL(".", import.meta.url)),
    })
  : spawn("kiro-cli", ["chat", task], { stdio: "inherit" });

child.on("error", (err) => {
  console.error(chalk.red(`Could not start the agent: ${err.message}`));
  process.exit(1);
});

async function isRevoked(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/status?agentId=${encodeURIComponent(AGENT_ID)}`, {
      signal: AbortSignal.timeout(2000),
    });
    return ((await res.json()) as { status?: string }).status === "revoked";
  } catch {
    return false; // Gateway hiccup: keep going. The MCP server still fails closed on every action.
  }
}

// 5. Agent finished on its own. It may have exited because it saw the revoke first, so check once more.
let stopping = false;
child.on("exit", async (code) => {
  clearInterval(poll);
  if (stopping) return;
  if (await isRevoked()) revoke();
  else process.exit(code ?? 1);
});

// 4. Poll /status; kill the agent on revoke.
let busy = false;
const poll = setInterval(async () => {
  if (busy || stopping) return;
  busy = true;
  if (await isRevoked()) revoke();
  busy = false;
}, 1000);

function revoke() {
  stopping = true;
  clearInterval(poll);
  let force: NodeJS.Timeout | undefined;
  const done = () => {
    clearTimeout(force);
    console.log("\n" + chalk.bgRed.white.bold("  SADDLE: run stopped - agent access revoked  "));
    process.exit(2);
  };
  if (child.exitCode !== null || child.signalCode !== null) return done();
  child.kill("SIGTERM");
  force = setTimeout(() => child.kill("SIGKILL"), 2000);
  child.once("exit", done);
}
