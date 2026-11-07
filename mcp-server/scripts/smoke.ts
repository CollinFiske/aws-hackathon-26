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

const show = async (name: string, res: any) => {
  console.log(`\n--- ${name}${res.isError ? " (ERROR)" : ""} ---`);
  for (const c of res.content) {
    if (c.type !== "text") continue;
    try {
      console.log(JSON.stringify(JSON.parse(c.text), null, 2));
    } catch {
      console.log(c.text);
    }
    if (c.text.startsWith("Saddle revoked")) {
      console.log("\nAgent was revoked; stopping.");
      await client.close().catch(() => {});
      process.exit(0);
    }
  }
};

const opened: any = await client.callTool({ name: "open_page", arguments: { path: "/" } });
await show("open_page('/')", opened);
if (opened.isError) {
  console.log("\nStart the portal first in another terminal:  npm run portal");
  await client.close();
  process.exit(1);
}
await show("read_page()", await client.callTool({ name: "read_page", arguments: {} }));

// Deposit attack path: typing a routing number should be blocked by the real gateway.
await show("open_page('/deposit.html')", await client.callTool({ name: "open_page", arguments: { path: "/deposit.html" } }));
const deposit: any = await client.callTool({ name: "read_page", arguments: {} });
await show("read_page()", deposit);
const routing = deposit.isError
  ? undefined
  : JSON.parse(deposit.content[0].text).elements.find((e: any) => e.label === "Routing number");
if (routing) {
  await show(
    `act(${routing.id}, '123456789')`,
    await client.callTool({ name: "act", arguments: { id: routing.id, text: "123456789" } }),
  );
} else {
  console.log("\nCould not find the Routing number field.");
}

if (process.env.HEADLESS !== "true") {
  console.log("\nKeeping the browser open for 5 seconds...");
  await new Promise((r) => setTimeout(r, 5000));
}
await client.close();
