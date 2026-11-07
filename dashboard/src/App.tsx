import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_ID, getEvents, getStatus, revoke, startSession, type SaddleEvent, type Status } from './api';

const POLL_MS = 1000;
const FLASH_MS = 1600;

const pathOf = (url: string) => {
  try { return new URL(url).pathname; } catch { return url || '-'; }
};
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour12: false });
};

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [task, setTask] = useState('');
  const [events, setEvents] = useState<SaddleEvent[]>([]); // oldest first
  const [selectedSk, setSelectedSk] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lastSk = useRef<string | undefined>(undefined);
  const statusInFlight = useRef(false);
  const eventsInFlight = useRef(false);

  const pollStatus = useCallback(async () => {
    if (statusInFlight.current) return;
    statusInFlight.current = true;
    try {
      const s = await getStatus();
      setStatus(s.status);
      setTask(s.task ?? '');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      statusInFlight.current = false;
    }
  }, []);

  const pollEvents = useCallback(async () => {
    if (eventsInFlight.current) return;
    eventsInFlight.current = true;
    try {
      const { events: fresh } = await getEvents(lastSk.current);
      if (fresh.length) {
        lastSk.current = fresh[fresh.length - 1].sk;
        setEvents((prev) => [...prev, ...fresh]);
        const blocks = fresh.filter((e) => e.decision !== 'allow').map((e) => e.sk);
        if (blocks.length) {
          setFlashing((prev) => new Set([...prev, ...blocks]));
          setTimeout(() => setFlashing((prev) => {
            const next = new Set(prev);
            blocks.forEach((sk) => next.delete(sk));
            return next;
          }), FLASH_MS);
        }
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      eventsInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    pollStatus();
    pollEvents();
    const id = setInterval(() => { pollStatus(); pollEvents(); }, POLL_MS);
    return () => clearInterval(id);
  }, [pollStatus, pollEvents]);

  const onRevoke = async () => {
    setBusy(true);
    try { await revoke(); setStatus('revoked'); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const onReset = async () => {
    setBusy(true);
    try {
      await startSession(task);
      // Keep lastSk so old events stay off screen; only clear what's shown.
      setEvents([]);
      setSelectedSk(null);
      setStatus('active');
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const total = events.length;
  const allowed = events.filter((e) => e.decision === 'allow').length;
  const blocked = total - allowed;
  const newestFirst = [...events].reverse();
  const selected = events.find((e) => e.sk === selectedSk) ?? events[events.length - 1];

  const pill = status === 'active' ? ['ACTIVE', 'pill-active']
    : status === 'revoked' ? ['REVOKED', 'pill-revoked']
    : ['NO RUN', 'pill-none'];

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="wordmark">Saddle</span>
          <span className="agent">agent <code>{AGENT_ID}</code></span>
          <span className={`pill ${pill[1]}`}>{pill[0]}</span>
        </div>
        <div className="actions">
          <button className="btn-reset" onClick={onReset} disabled={busy}>Reset run</button>
          <button className="btn-revoke" onClick={onRevoke} disabled={busy || status === 'revoked'}>Revoke agent</button>
        </div>
      </header>

      <div className="task"><span className="muted">Task</span> {task || <span className="muted">no task yet</span>}</div>

      {error && <div className="error-banner">API error: {error} (still polling)</div>}

      <section className="counters">
        <div className="counter"><div className="num">{total}</div><div className="label">Total actions</div></div>
        <div className="counter ok"><div className="num">{allowed}</div><div className="label">Allowed</div></div>
        <div className="counter bad"><div className="num">{blocked}</div><div className="label">Blocked</div></div>
      </section>

      <main className="main">
        <section className="feed">
          {newestFirst.length === 0 && <div className="empty">Waiting for agent actions...</div>}
          {newestFirst.map((e) => (
            <button
              key={e.sk}
              className={`row ${e.sk === selected?.sk ? 'selected' : ''} ${flashing.has(e.sk) ? 'flash' : ''}`}
              onClick={() => setSelectedSk(e.sk)}
            >
              <span className="time">{timeOf(e.ts)}</span>
              <span className="action">{e.action}</span>
              <span className="label-col" title={e.elementLabel}>{e.elementLabel || '-'}</span>
              <span className="path">{pathOf(e.pageUrl)}</span>
              <span className={`badge badge-${e.decision}`}>{e.decision.toUpperCase()}</span>
              <span className="source">{e.source}</span>
              <span className="reason">{e.reason}</span>
            </button>
          ))}
        </section>

        <aside className="shot">
          {selected ? (
            <>
              {selected.screenshotUrl
                ? <img src={selected.screenshotUrl} alt={`Screenshot before ${selected.action}`} />
                : <div className="noshot">No screenshot for this action</div>}
              <div className="shot-meta">
                <span className={`badge badge-${selected.decision}`}>{selected.decision.toUpperCase()}</span>
                <span className="source">{selected.source}</span>
                <span>{selected.action} {selected.elementLabel ? `"${selected.elementLabel}"` : pathOf(selected.pageUrl)}</span>
              </div>
              <div className="shot-reason">{selected.reason}</div>
            </>
          ) : <div className="noshot">Screenshots appear here</div>}
        </aside>
      </main>
    </div>
  );
}
