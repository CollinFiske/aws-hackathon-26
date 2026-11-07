# Saddle

Hackathon project for the AWS x A10 Hack (A10 track, Prompt 2: Agent Harness), built in about 8 hours by 2 people.
Saddle is a harness for a CLI AI agent (Kiro CLI) that browses a student portal through an MCP server.
Every agent action goes through a central gateway on AWS that logs it, applies policy, asks a Bedrock
judge when rules don't decide, and can revoke the agent mid-run.

## Rules for Claude Code
- Read contract.md before touching anything that crosses the A/B boundary. Never change the contract
  silently; tell me if it needs to change.
- Simplest thing that works. No test suites, no extra abstractions, minimal dependencies.
- Node 20+, ESM. TypeScript run with tsx for mcp-server and cli. The Lambda is a single plain
  JavaScript ESM file (infra/lambda/index.mjs).
- AWS region us-west-2. Read config from .env with dotenv; never hardcode keys, URLs or bucket names.
- The MCP server talks over stdio: it must never print to stdout. All logs go to stderr.
- The portal is fake data, clearly labeled as a demo. Never point automation at real university systems.

## Folders
- mcp-server/  Playwright-based MCP server the agent uses (Person A)
- portal/      static demo student portal with fake data (Person A)
- cli/         `saddle run` wrapper that launches Kiro CLI and kills it on revoke (Person A)
- infra/lambda/ gateway + policy + Bedrock judge Lambda (Person B)
- dashboard/   React (Vite) live dashboard with revoke button (Person B)
