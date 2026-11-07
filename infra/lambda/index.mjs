// Saddle gateway: one Lambda behind an API Gateway HTTP API (payload v2).
// Routes: POST /session, POST /check, GET /status, POST /revoke, GET /events (see contract.md).
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { decide } from './policy.mjs';

const { AGENTS_TABLE, EVENTS_TABLE, SCREENSHOT_BUCKET } = process.env;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const getAgent = async (agentId) =>
  (await ddb.send(new GetCommand({ TableName: AGENTS_TABLE, Key: { agentId } }))).Item;

const newSk = () => `${Date.now()}#${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;

async function writeEvent(check, result) {
  const sk = newSk();
  await ddb.send(new PutCommand({
    TableName: EVENTS_TABLE,
    Item: {
      agentId: check.agentId,
      sk,
      ts: new Date().toISOString(),
      action: check.action,
      elementLabel: check.elementLabel ?? '',
      value: check.value,
      pageUrl: check.pageUrl ?? '',
      screenshotKey: check.screenshotKey,
      decision: result.decision,
      reason: result.reason,
      source: result.source,
    },
  }));
  return sk;
}

// ---- routes ----

async function postSession(body) {
  if (!body.agentId) return json(400, { error: 'agentId required' });
  await ddb.send(new PutCommand({
    TableName: AGENTS_TABLE,
    Item: { agentId: body.agentId, task: body.task ?? '', status: 'active', updatedAt: new Date().toISOString() },
  }));
  return json(200, { ok: true });
}

async function getStatus(qs) {
  if (!qs.agentId) return json(400, { error: 'agentId required' });
  const agent = await getAgent(qs.agentId);
  if (!agent) return json(200, { status: 'none', task: '' });
  return json(200, { status: agent.status, task: agent.task ?? '' });
}

async function postRevoke(body) {
  if (!body.agentId) return json(400, { error: 'agentId required' });
  await ddb.send(new UpdateCommand({
    TableName: AGENTS_TABLE,
    Key: { agentId: body.agentId },
    UpdateExpression: 'SET #s = :r, updatedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':r': 'revoked', ':t': new Date().toISOString() },
  }));
  return json(200, { ok: true });
}

async function postCheck(check) {
  if (!check.agentId) return json(400, { error: 'agentId required' });
  const agent = await getAgent(check.agentId);

  if (!agent || agent.status !== 'active') {
    const result = { decision: 'revoked', reason: 'Agent access was revoked', source: 'revoked' };
    await writeEvent(check, result);
    return json(403, result);
  }

  let result = decide(agent, check);
  if (result.decision === 'judge') {
    // B3 replaces this with the Bedrock judge.
    result = { decision: 'allow', reason: 'pending judge', source: 'judge' };
  }

  const eventId = await writeEvent(check, result);
  return json(200, { decision: result.decision, reason: result.reason, source: result.source, eventId });
}

async function getEvents(qs) {
  if (!qs.agentId) return json(400, { error: 'agentId required' });
  const params = {
    TableName: EVENTS_TABLE,
    KeyConditionExpression: qs.since ? 'agentId = :a AND sk > :s' : 'agentId = :a',
    ExpressionAttributeValues: qs.since ? { ':a': qs.agentId, ':s': qs.since } : { ':a': qs.agentId },
    ScanIndexForward: true, // oldest first
    Limit: 200,
  };
  const { Items = [] } = await ddb.send(new QueryCommand(params));
  const events = await Promise.all(Items.map(async (e) => {
    const { screenshotKey, agentId, ...rest } = e;
    let screenshotUrl;
    if (screenshotKey && SCREENSHOT_BUCKET) {
      screenshotUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: SCREENSHOT_BUCKET, Key: screenshotKey }), { expiresIn: 900 });
    }
    return { ...rest, screenshotUrl };
  }));
  return json(200, { events });
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  const path = event.rawPath;
  const qs = event.queryStringParameters ?? {};
  try {
    switch (`${method} ${path}`) {
      case 'POST /session': return await postSession(parseBody(event));
      case 'POST /check':   return await postCheck(parseBody(event));
      case 'GET /status':   return await getStatus(qs);
      case 'POST /revoke':  return await postRevoke(parseBody(event));
      case 'GET /events':   return await getEvents(qs);
      default:              return json(404, { error: `No route for ${method} ${path}` });
    }
  } catch (err) {
    console.error(err);
    return json(500, { error: err.message ?? 'Internal error' });
  }
};
