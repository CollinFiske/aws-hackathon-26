# Saddle API contract

Base URL: SADDLE_API_URL (API Gateway HTTP API, us-west-2)
Agent ID for the demo: saddle-demo

## POST /session
Starts or resets a run. Sets the agent to active and stores the student's task.
Body: { "agentId": "saddle-demo", "task": "What's my GPA and was my timesheet approved?" }
Returns 200: { "ok": true }

## POST /check   (called by the MCP server BEFORE every action)
Body: {
  "agentId": "saddle-demo",
  "action": "navigate" | "click" | "type",
  "elementLabel": "Save direct deposit",   // visible text or aria-label; "" for navigate
  "value": "123456789",                    // only for type
  "pageUrl": "http://localhost:4000/deposit.html",
  "screenshotKey": "saddle-demo/1730990000000.png"  // S3 key of the screenshot taken just before
}
Returns 200: { "decision": "allow" | "block", "reason": "short sentence", "source": "rule" | "judge", "eventId": "..." }
Returns 403: { "decision": "revoked", "reason": "Agent access was revoked", "source": "revoked" }

## GET /status?agentId=saddle-demo
Returns 200: { "status": "active" | "revoked" | "none", "task": "..." }

## POST /revoke
Body: { "agentId": "saddle-demo" }
Returns 200: { "ok": true }

## GET /events?agentId=saddle-demo&since=<sk>
Returns 200: { "events": [ {
  "sk": "1730990000000#a1b2", "ts": "2026-11-07T19:00:00.000Z",
  "action": "type", "elementLabel": "Routing number", "pageUrl": "...",
  "decision": "allow" | "block" | "revoked", "reason": "...", "source": "rule" | "judge" | "revoked",
  "screenshotUrl": "https://...presigned..." } ] }
Events are oldest first. Pass the last sk you saw as since to get only newer ones.