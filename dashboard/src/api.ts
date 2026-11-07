// Thin client for the Saddle API. Shapes follow contract.md exactly.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
export const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'saddle-demo';

export type Status = 'active' | 'revoked' | 'none';
export type Decision = 'allow' | 'block' | 'revoked';

export interface SaddleEvent {
  sk: string;
  ts: string;
  action: 'navigate' | 'click' | 'type';
  elementLabel: string;
  pageUrl: string;
  decision: Decision;
  reason: string;
  source: 'rule' | 'judge' | 'revoked';
  screenshotUrl?: string;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new Error('VITE_API_URL is not set (see dashboard/.env.example)');
  const res = await fetch(API_URL + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const getStatus = () =>
  call<{ status: Status; task: string }>('GET', `/status?agentId=${encodeURIComponent(AGENT_ID)}`);

export const getEvents = (since?: string) =>
  call<{ events: SaddleEvent[] }>(
    'GET',
    `/events?agentId=${encodeURIComponent(AGENT_ID)}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
  );

export const revoke = () => call<{ ok: boolean }>('POST', '/revoke', { agentId: AGENT_ID });

export const startSession = (task: string) =>
  call<{ ok: boolean }>('POST', '/session', { agentId: AGENT_ID, task });
