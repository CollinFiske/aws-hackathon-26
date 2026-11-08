// Saddle policy: deterministic rules decide every action (no LLM judge).
// decide(agent, check) -> { decision: 'allow' | 'block', reason, source: 'rule' }

const PORTAL_HOST = () => process.env.PORTAL_HOST || 'localhost:4000';

const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };
const pathOf = (url) => { try { return new URL(url).pathname; } catch { return ''; } };
const isInteraction = (c) => c.action === 'click' || c.action === 'type';
const SENSITIVE_LABEL = /routing|account number|bank|direct deposit|password|ssn/i;

// Checked first. Any match -> block.
export const NEVER_RULES = [
  {
    name: 'stay-in-portal',
    test: (c) => c.action === 'navigate' && hostOf(c.pageUrl) !== PORTAL_HOST(),
    reason: () => 'Navigation outside the student portal',
  },
  {
    name: 'no-direct-deposit-changes',
    test: (c) => isInteraction(c) && pathOf(c.pageUrl).includes('/deposit'),
    reason: () => 'Agents may never change direct deposit',
  },
  {
    name: 'no-sensitive-fields',
    test: (c) => isInteraction(c) && SENSITIVE_LABEL.test(c.elementLabel ?? ''),
    reason: (c) => `Agents may never touch the "${c.elementLabel}" field`,
  },
  {
    name: 'no-bank-numbers',
    test: (c) => c.action === 'type' && /^\d{8,17}$/.test(String(c.value ?? '').replace(/[\s-]/g, '')),
    reason: () => 'Agents may never enter bank numbers',
  },
];

// Checked second. Any match -> allow.
export const ALLOW_RULES = [
  {
    name: 'read-inside-portal',
    test: (c) => c.action === 'navigate' && hostOf(c.pageUrl) === PORTAL_HOST(),
    reason: () => 'Reading a portal page',
  },
  {
    name: 'safe-navigation-clicks',
    test: (c) => c.action === 'click' && /^(home|grades|pay|jobs|view|details|back)/i.test((c.elementLabel ?? '').trim()),
    reason: (c) => `Navigation click on "${c.elementLabel}"`,
  },
];

export function decide(agent, check) {
  for (const rule of NEVER_RULES) {
    if (rule.test(check)) return { decision: 'block', reason: rule.reason(check), source: 'rule', rule: rule.name };
  }
  for (const rule of ALLOW_RULES) {
    if (rule.test(check)) return { decision: 'allow', reason: rule.reason(check), source: 'rule', rule: rule.name };
  }
  // No NEVER rule fired: allow. The NEVER rules above are what stop sensitive actions.
  return { decision: 'allow', reason: 'No safety rule triggered', source: 'rule', rule: 'default-allow' };
}
