// Spawns the MCP server over stdio, opens the portal home page and reads it.
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverFile = fileURLToPath(new URL("../src/index.ts", import.meta.url));

const transport = new StdioClientTransport({
  // node --import tsx avoids spawning npx, which needs a shell on Windows.
  command: process.execPath,
  args: ["--import", "tsx", serverFile],
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: process.env as Record<string, string>,
  stderr: "inherit",
});

const client = new Client({ name: "saddle-smoke", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const show = (name: string, res: any) => {
  console.log(`\n--- ${name}${res.isError ? " (ERROR)" : ""} ---`);
  for (const c of res.content) {
    if (c.type !== "text") continue;
    try {
      console.log(JSON.stringify(JSON.parse(c.text), null, 2));
    } catch {
      console.log(c.text);
    }
  }
};

const opened: any = await client.callTool({ name: "open_page", arguments: { path: "/" } });
show("open_page('/')", opened);
if (opened.isError) {
  console.log("\nStart the portal first in another terminal:  npm run portal");
  await client.close();
  process.exit(1);
}
show("read_page()", await client.callTool({ name: "read_page", arguments: {} }));

if (process.env.HEADLESS !== "true") {
  console.log("\nKeeping the browser open for 5 seconds...");
  await new Promise((r) => setTimeout(r, 5000));
}
await client.close();
