// Saddle policy. B1 stub: allow everything. B2 replaces this with real rules.
export function decide(agent, check) {
  return { decision: 'allow', reason: 'stub', source: 'rule' };
}
