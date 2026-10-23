// Talks to the Apps Script web app. The URL and key live only in this phone's
// storage, never in the code (the code is public on GitHub Pages).

import { DEMO_DATA } from './demo.js';

const STORE = 'fortunecat.connection';
const CACHE = 'fortunecat.data';

export function getConnection() {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
}

export function saveConnection(conn) {
  try { localStorage.setItem(STORE, JSON.stringify(conn)); } catch { /* private mode */ }
}

export function clearConnection() {
  try { localStorage.removeItem(STORE); localStorage.removeItem(CACHE); } catch { /* ignore */ }
}

export function cachedData() {
  try { return JSON.parse(localStorage.getItem(CACHE)) || null; } catch { return null; }
}

let demo = null;

/** Calls an action; resolves with the full, fresh data set. */
export async function call(action, params = {}) {
  const conn = getConnection();
  if (!conn) throw new Error('Not connected');
  if (conn.demo) return demoCall(action, params);

  const res = await fetch(conn.url, {
    method: 'POST',
    // text/plain avoids a CORS preflight, which Apps Script can't answer.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: conn.key, action, ...params }),
  });
  if (!res.ok) throw new Error('Server error ' + res.status);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'Something went wrong');
  try { localStorage.setItem(CACHE, JSON.stringify(body.data)); } catch { /* full or private */ }
  return body.data;
}

// ---------- Demo mode: same actions, on an in-memory copy of sample data ----------

function demoCall(action, p) {
  if (!demo) demo = JSON.parse(JSON.stringify(DEMO_DATA()));
  const tx = id => demo.transactions.find(t => t.id === id);
  const goal = id => demo.goals.find(g => g.id === id);
  switch (action) {
    case 'data': break;
    case 'setCategory': {
      const t = tx(p.id); t.category = p.category;
      if (p.remember) demo.transactions.forEach(o => { if (o.merchant === t.merchant && o.category === 'Uncategorised') o.category = p.category; });
      break;
    }
    case 'setStatus': tx(p.id).status = p.status; break;
    case 'addManual':
      demo.transactions.unshift({ id: 'manual-' + Date.now(), date: p.date || new Date().toISOString(), amount: +p.amount,
        merchant: p.merchant || 'Cash', category: p.category, source: 'Manual', card: 'Manual', notes: p.notes || '', status: 'counted' });
      break;
    case 'deleteManual': demo.transactions = demo.transactions.filter(t => t.id !== p.id); break;
    case 'setBudget':
      demo.settings.dailyBudget = +p.dailyBudget;
      if (!demo.settings.budgetStarted) demo.settings.budgetStarted = new Date().toISOString();
      break;
    case 'addGoal':
      demo.goals.push({ id: 'goal-' + Date.now(), name: p.name, emoji: p.emoji || '🎁', target: +p.target, saved: 0, created: new Date().toISOString(), status: 'active' });
      break;
    case 'contribute': { const g = goal(p.id); g.saved = Math.max(0, Math.round((g.saved + +p.amount) * 100) / 100); break; }
    case 'setGoalStatus':
      if (p.status === 'deleted') demo.goals = demo.goals.filter(g => g.id !== p.id);
      else goal(p.id).status = p.status;
      break;
    default: throw new Error('Unknown action');
  }
  demo.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  return Promise.resolve(JSON.parse(JSON.stringify(demo)));
}
