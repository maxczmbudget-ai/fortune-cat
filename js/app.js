import { call, getConnection, saveConnection, clearConnection, cachedData } from './api.js';
import { computeBudget, monthBreakdown, dayKey, isDaily, ONE_OFF_MULTIPLIER } from './budget.js';
import { buildTips } from './tips.js';
import { renderCat, dropCoins } from './cat.js';

const view = document.getElementById('view');
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheet-body');

const CATEGORY_ICONS = {
  Food: '🍜', Groceries: '🛒', Transport: '🚕', Shopping: '🛍️', Travel: '✈️', Entertainment: '🎬',
  Health: '💊', 'Transfers to people': '🤝', Other: '📦', Uncategorised: '❓',
};
const GOAL_EMOJIS = ['🎁', '🗾', '✈️', '🎧', '📱', '💻', '👟', '🎮', '🏖️', '💍', '🚲', '🐷'];
// QR / payment processors used by many shops: "always use this category" is off by default.
const PAYMENT_PROCESSORS = /FOMO ?PAY|NETS|PAYNOW|STRIPE|ADYEN|2C2P|RAZER|HITPAY|QFPAY/i;
const STATUS_LABELS ={ counted: 'Daily', kept: 'Daily', 'one-off': 'One-off', fixed: 'Fixed monthly' };

const state = {
  data: null,
  tab: 'home',
  month: dayKey(new Date()).slice(0, 7),
  onlyUncategorised: false,
  busy: false,
};

// ---------- Helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n < 0 ? '−' : '') + 'S$' + Math.abs(n).toFixed(2);
const sgParts = iso => new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
const fmtTime = iso => sgParts(iso).toISOString().slice(11, 16);
const fmtDay = key => {
  const today = dayKey(new Date());
  const d = new Date(key + 'T00:00:00Z');
  const yest = dayKey(new Date(Date.now() - 86400000));
  if (key === today) return 'Today';
  if (key === yest) return 'Yesterday';
  return d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const fmtMonth = m => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function summary() {
  const d = state.data;
  return computeBudget({ transactions: d.transactions, settings: d.settings, goals: d.goals, now: new Date() });
}

async function run(action, params, successMsg) {
  if (state.busy) return;
  state.busy = true;
  setSpinning(true);
  try {
    state.data = await call(action, params);
    if (successMsg) toast(successMsg);
    render();
    return true;
  } catch (e) {
    toast(e.message === 'Failed to fetch' ? "Can't reach your Sheet. Check your connection." : e.message);
    return false;
  } finally {
    state.busy = false;
    setSpinning(false);
  }
}

function setSpinning(on) {
  document.querySelector('[data-action="refresh"]').classList.toggle('spinning', on);
}

// ---------- Rendering ----------

function render() {
  const conn = getConnection();
  document.body.classList.toggle('no-fab', !conn || !state.data || state.tab === 'settings');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  document.querySelector('.tabs').hidden = !conn;
  if (!conn) { view.innerHTML = connectView(); renderCat(document.getElementById('cat-stage'), 3); return; }
  if (!state.data) { view.innerHTML = '<div class="empty">Loading your spending…</div>'; return; }
  const views = { home: homeView, history: historyView, goals: goalsView, settings: settingsView };
  view.innerHTML = views[state.tab]();
  if (state.tab === 'home') afterHome();
}

function txRow(tx) {
  const excluded = !isDaily(tx);
  const tags = [
    tx.category === 'Uncategorised' ? '<span class="tag warn">Needs category</span>' : '',
    tx.status === 'one-off' ? '<span class="tag">One-off</span>' : '',
    tx.status === 'fixed' ? '<span class="tag">Fixed</span>' : '',
  ].join('');
  const sub = [fmtTime(tx.date), tx.category, tx.notes].filter(Boolean).join(' · ');
  return `<button class="row" data-action="open-tx" data-id="${esc(tx.id)}">
    <span class="ico" aria-hidden="true">${CATEGORY_ICONS[tx.category] || '📦'}</span>
    <span class="main"><span class="title">${esc(tx.merchant)}${tags}</span><span class="sub">${esc(sub)}</span></span>
    <span class="amt num ${excluded ? 'excluded' : ''}">${money(tx.amount)}</span>
  </button>`;
}

function homeView() {
  const s = summary();
  const d = state.data;
  const todayTx = d.transactions.filter(tx => dayKey(tx.date) === s.today);
  const tips = buildTips({ transactions: d.transactions, summary: s, now: new Date() });
  const trophies = d.goals.filter(g => g.status === 'bought').map(g => esc(g.emoji)).join('');

  let todayCard;
  if (s.mode === 'monitoring') {
    todayCard = `<section class="card today">
      <div class="muted small">Spent today</div>
      <div class="big num">${money(s.todaySpent)}</div>
      <div class="muted small">${s.monitoringDaysLeft > 0
        ? `Monitoring: day ${s.monitoringDay} of 14. No budget yet. Just spend as usual.`
        : 'Monitoring done.'}</div>
      ${s.suggestion ? `<p class="small">Your average so far: <b class="num">${money(s.suggestion.average)}</b> a day.</p>
        <button class="btn primary block" data-action="set-budget" data-value="${s.suggestion.suggested}">Set S$${s.suggestion.suggested} a day (10% under average)</button>` : ''}
    </section>`;
  } else {
    const pct = s.allowance > 0 ? Math.min(100, (s.todaySpent / s.allowance) * 100) : 100;
    const cls = s.remaining < 0 ? 'over' : pct > 75 ? 'warn' : '';
    todayCard = `<section class="card today">
      <div class="muted small">${s.remaining < 0 ? 'Over budget today' : 'Left to spend today'}</div>
      <div class="big num ${s.remaining < 0 ? 'over' : ''}">${money(Math.abs(s.remaining))}</div>
      <div class="meter ${cls}" role="img" aria-label="${money(s.todaySpent)} of ${money(s.allowance)} spent"><span style="width:${s.remaining < 0 ? 100 : pct}%"></span></div>
      <div class="meter-legend"><span>Spent ${money(s.todaySpent)}</span><span>Today's budget ${money(s.allowance)}${s.allowance < s.budget ? ' (paying back)' : ''}</span></div>
    </section>`;
  }

  const prompts = (s.oneOffCandidates || []).map(tx => `<section class="card prompt">
      <p><b>${money(tx.amount)}</b> at <b>${esc(tx.merchant)}</b> is more than ${ONE_OFF_MULTIPLIER}× your daily budget. Should it count?</p>
      <div class="btns">
        <button class="btn gold" data-action="status" data-id="${esc(tx.id)}" data-status="one-off">Mark as one-off</button>
        <button class="btn" data-action="status" data-id="${esc(tx.id)}" data-status="kept">Count it today</button>
      </div>
    </section>`).join('');

  const wealthLine = s.mode === 'monitoring'
    ? 'Your cat wakes up once you set a daily budget.'
    : `${money(s.wealth)} saved · ${s.score >= 0 ? `${s.score} days of budget in hand` : `${Math.abs(s.score)} days in the red`}`;

  return `<section class="hero">
      <div class="cat-stage" id="cat-stage"></div>
      <div class="tier-pill">${esc(s.tier.name)}</div>
      <div class="wealth-line">${wealthLine}</div>
      ${trophies ? `<div class="trophies" aria-label="Goals you've bought">${trophies}</div>` : ''}
    </section>
    ${prompts}
    ${todayCard}
    ${tips.length ? `<section class="card"><h2>Tips</h2>${tips.map(t => `<div class="tip"><span class="t-ico" aria-hidden="true">${t.icon}</span><span>${esc(t.text)}</span></div>`).join('')}</section>` : ''}
    <div class="section-title">Today</div>
    <section class="card">${todayTx.length ? todayTx.map(txRow).join('') : '<div class="empty">No payments yet today. 🐾</div>'}</section>`;
}

function afterHome() {
  const s = summary();
  const stage = document.getElementById('cat-stage');
  renderCat(stage, s.tier.tier);
  if (s.mode === 'budget' && s.yesterday && s.yesterday.left >= 0 && store.get('fortunecat.coins') !== s.today) {
    store.set('fortunecat.coins', s.today);
    setTimeout(() => dropCoins(stage), 500);
    toast(`Yesterday's ${money(s.yesterday.left)} went into savings 🪙`);
  }
}

function historyView() {
  const d = state.data;
  const b = monthBreakdown(d.transactions, state.month);
  const max = b.categories.length ? b.categories[0].total : 1;
  const uncatCount = d.transactions.filter(tx => tx.category === 'Uncategorised').length;
  const list = d.transactions
    .filter(tx => state.onlyUncategorised ? tx.category === 'Uncategorised' : dayKey(tx.date).slice(0, 7) === state.month);

  const byDay = {};
  for (const tx of list) (byDay[dayKey(tx.date)] ||= []).push(tx);
  const days = Object.keys(byDay).sort().reverse();
  const thisMonth = dayKey(new Date()).slice(0, 7);

  return `<div class="month-nav">
      <button class="icon-btn" data-action="month" data-step="-1" aria-label="Previous month">‹</button>
      <h1>${fmtMonth(state.month)}</h1>
      <button class="icon-btn" data-action="month" data-step="1" aria-label="Next month" ${state.month >= thisMonth ? 'disabled' : ''}>›</button>
    </div>
    <section class="card">
      <div class="muted small">Spent this month</div>
      <div class="month-total">${money(b.total)}</div>
      <div class="split"><span>Daily <b>${money(b.daily)}</b></span><span>One-off <b>${money(b.oneOff)}</b></span><span>Fixed <b>${money(b.fixed)}</b></span></div>
      ${b.categories.length ? `<div class="bars">${b.categories.map(c => `
        <div class="bar-row" title="${esc(c.category)}: ${money(c.total)}">
          <span class="label">${CATEGORY_ICONS[c.category] || ''} ${esc(c.category)}</span><span class="value">${money(c.total)}</span>
          <span class="track"><span style="width:${Math.max(2, (c.total / max) * 100)}%"></span></span>
        </div>`).join('')}</div>` : ''}
    </section>
    <div class="filter">
      <button class="chip" data-action="filter" aria-pressed="${!state.onlyUncategorised}">All payments</button>
      <button class="chip" data-action="filter" aria-pressed="${state.onlyUncategorised}">Needs category${uncatCount ? ` (${uncatCount})` : ''}</button>
    </div>
    ${days.length ? days.map(k => {
      const dayTotal = byDay[k].filter(isDaily).reduce((s, tx) => s + tx.amount, 0);
      return `<div class="day-head"><span>${fmtDay(k)}</span><strong>${money(dayTotal)}</strong></div>
        <section class="card" style="margin-top:4px;padding:4px 12px">${byDay[k].map(txRow).join('')}</section>`;
    }).join('') : `<div class="empty">${state.onlyUncategorised ? 'Everything has a category. 🎉' : 'No payments this month.'}</div>`}`;
}

function goalsView() {
  const d = state.data;
  const s = summary();
  const active = d.goals.filter(g => g.status === 'active');
  const bought = d.goals.filter(g => g.status === 'bought');
  const spare = s.mode === 'budget' ? s.spareCash : 0;
  return `<section class="card spare">
      <div><div class="muted small">Spare cash to put into goals</div><div class="big num">${money(spare)}</div>
      <div class="muted small">${s.mode === 'budget' ? 'Money left over from days under budget.' : 'Set a daily budget first. Leftovers land here.'}</div></div>
    </section>
    <div class="section-title">Saving for</div>
    ${active.length ? active.map(g => {
      const pct = Math.min(100, (g.saved / g.target) * 100);
      const done = g.saved >= g.target;
      return `<section class="card goal">
        <span class="g-ico" aria-hidden="true">${esc(g.emoji)}</span>
        <span class="g-name">${esc(g.name)}</span>
        <span class="g-meta num">${money(g.saved)} of ${money(g.target)}</span>
        <div class="meter" role="img" aria-label="${Math.round(pct)}% saved"><span style="width:${pct}%"></span></div>
        <div class="btns">
          ${done
            ? `<button class="btn gold" data-action="goal-bought" data-id="${esc(g.id)}">Bought it! 🎉</button>`
            : `<button class="btn primary" data-action="goal-add" data-id="${esc(g.id)}" ${spare <= 0 ? 'disabled' : ''}>Add savings</button>`}
          <button class="btn link" data-action="goal-remove" data-id="${esc(g.id)}">Remove</button>
        </div>
      </section>`;
    }).join('') : '<div class="card empty">No goals yet. What are you saving for?</div>'}
    <button class="btn block" style="margin-top:12px" data-action="goal-new">+ New goal</button>
    ${bought.length ? `<div class="section-title">Your cat's collection</div>
      <section class="card shelf">${bought.map(g => `<span class="trophy"><span aria-hidden="true">${esc(g.emoji)}</span>${esc(g.name)}</span>`).join('')}</section>` : ''}`;
}

function settingsView() {
  const conn = getConnection();
  const s = summary();
  const budget = state.data.settings.dailyBudget || '';
  return `<section class="card">
      <h2>Daily budget</h2>
      <form data-form="budget">
        <label class="field">Amount per day (S$)
          <input name="dailyBudget" type="number" inputmode="decimal" min="1" step="0.5" value="${budget}" placeholder="${s.suggestion ? s.suggestion.suggested : '30'}" required>
        </label>
        ${s.suggestion ? `<p class="small muted">Suggested: S$${s.suggestion.suggested} (your average is ${money(s.suggestion.average)} a day over ${s.suggestion.days} days).</p>` : ''}
        <p class="small muted">Leftovers go to spare cash. Overspending is paid back over the next 7 days. Rent, insurance and subscriptions: mark them "Fixed monthly" and they won't count.</p>
        <button class="btn primary block">Save budget</button>
      </form>
    </section>
    <section class="card">
      <h2>Connection</h2>
      <p class="small muted">${conn.demo ? 'Using sample data. Nothing is saved.' : 'Connected to your Google Sheet.'}</p>
      <button class="btn block" data-action="disconnect">${conn.demo ? 'Leave sample data' : 'Disconnect this phone'}</button>
    </section>`;
}

function connectView() {
  return `<section class="connect">
    <div class="cat-stage" id="cat-stage" style="width:min(50vw,180px)"></div>
    <h1>Fortune Cat</h1>
    <p class="muted">Connect to your Google Sheet. You'll find both values in SETUP.md, part D.</p>
    <form data-form="connect" class="card">
      <label class="field">Web app URL<input name="url" type="url" required placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
      <label class="field">App key<input name="key" required autocomplete="off" spellcheck="false"></label>
      <button class="btn primary block" style="margin-top:16px">Connect</button>
    </form>
    <button class="btn link" data-action="demo">Try it with sample data</button>
  </section>`;
}

// ---------- Sheets (bottom dialogs) ----------

function openSheet(html) {
  sheetBody.innerHTML = '<div class="sheet-grip"></div>' + html;
  if (!sheet.open) sheet.showModal();
}
function closeSheet() { if (sheet.open) sheet.close(); }

function txSheet(id) {
  const tx = state.data.transactions.find(t => t.id === id);
  if (!tx) return;
  const status = tx.status === 'kept' ? 'counted' : tx.status;
  const local = sgParts(tx.date);
  openSheet(`<h2 class="num">${money(tx.amount)}</h2>
    <div>${esc(tx.merchant)}</div>
    <dl class="kv">
      <dt>When</dt><dd>${fmtDay(dayKey(tx.date))}, ${local.toISOString().slice(11, 16)}</dd>
      <dt>Paid with</dt><dd>${esc(tx.card || tx.source)}</dd>
      ${tx.notes ? `<dt>Details</dt><dd>${esc(tx.notes)}</dd>` : ''}
    </dl>
    <label class="field">Category</label>
    <div class="chips">${state.data.categories.filter(c => c !== 'Uncategorised').map(c =>
      `<button class="chip" data-action="pick-category" data-id="${esc(tx.id)}" data-category="${esc(c)}" aria-pressed="${tx.category === c}">${CATEGORY_ICONS[c]} ${esc(c)}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" id="remember" ${tx.source === 'Manual' || PAYMENT_PROCESSORS.test(tx.merchant) ? '' : 'checked'}> Always use this for “${esc(tx.merchant)}”</label>
    <label class="field">Counts as</label>
    <div class="seg">${['counted', 'one-off', 'fixed'].map(st =>
      `<button data-action="status" data-id="${esc(tx.id)}" data-status="${st}" aria-pressed="${status === st}">${STATUS_LABELS[st]}</button>`).join('')}</div>
    <div class="sheet-actions">
      ${tx.source === 'Manual' ? `<button class="btn" data-action="delete-tx" data-id="${esc(tx.id)}">Delete</button>` : ''}
      <button class="btn primary" data-action="close-sheet">Done</button>
    </div>`);
}

function addSheet() {
  const now = sgParts(new Date().toISOString()).toISOString().slice(0, 16);
  openSheet(`<h2>Add a payment</h2>
    <form data-form="add">
      <label class="field">Amount (S$)<input class="amount-input" name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required autofocus></label>
      <label class="field">What / where<input name="merchant" placeholder="e.g. Hawker lunch" required></label>
      <label class="field">Category</label>
      <div class="chips" data-chip-group="category">${state.data.categories.filter(c => c !== 'Uncategorised').map((c, i) =>
        `<button type="button" class="chip" data-action="chip" data-value="${esc(c)}" aria-pressed="${i === 0}">${CATEGORY_ICONS[c]} ${esc(c)}</button>`).join('')}</div>
      <label class="field">When<input name="when" type="datetime-local" value="${now}" required></label>
      <div class="sheet-actions">
        <button type="button" class="btn" data-action="close-sheet">Cancel</button>
        <button class="btn primary">Add</button>
      </div>
    </form>`);
}

function goalSheet() {
  openSheet(`<h2>New goal</h2>
    <form data-form="goal">
      <label class="field">What are you saving for?<input name="name" required placeholder="e.g. Japan trip"></label>
      <label class="field">Target (S$)<input name="target" type="number" inputmode="decimal" min="1" step="1" required></label>
      <label class="field">Icon</label>
      <div class="chips" data-chip-group="emoji">${GOAL_EMOJIS.map((e, i) =>
        `<button type="button" class="chip" data-action="chip" data-value="${e}" aria-pressed="${i === 0}" style="font-size:20px">${e}</button>`).join('')}</div>
      <div class="sheet-actions">
        <button type="button" class="btn" data-action="close-sheet">Cancel</button>
        <button class="btn primary">Create goal</button>
      </div>
    </form>`);
}

function contributeSheet(id) {
  const g = state.data.goals.find(x => x.id === id);
  const spare = summary().spareCash;
  const need = Math.max(0, g.target - g.saved);
  const suggestion = Math.min(spare, need).toFixed(2);
  openSheet(`<h2>${esc(g.emoji)} ${esc(g.name)}</h2>
    <p class="muted small">You have ${money(spare)} spare. ${money(need)} to go.</p>
    <form data-form="contribute" data-id="${esc(id)}">
      <label class="field">Add (S$)<input class="amount-input" name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" max="${Math.min(spare, need).toFixed(2)}" value="${suggestion}" required></label>
      <div class="sheet-actions">
        <button type="button" class="btn" data-action="close-sheet">Cancel</button>
        <button class="btn primary">Add to goal</button>
      </div>
    </form>`);
}

// ---------- Events ----------

document.addEventListener('click', async e => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }

  const el = e.target.closest('[data-action]');
  if (!el) {
    if (e.target === sheet) closeSheet(); // tap on the backdrop
    return;
  }
  const { action, id } = el.dataset;
  switch (action) {
    case 'refresh': await run('data'); break;
    case 'open-add': addSheet(); break;
    case 'open-tx': txSheet(id); break;
    case 'close-sheet': closeSheet(); break;
    case 'pick-category': {
      const remember = document.getElementById('remember')?.checked;
      if (await run('setCategory', { id, category: el.dataset.category, remember }, remember ? 'Saved. Future payments here will use it too.' : 'Saved')) txSheet(id);
      break;
    }
    case 'status': {
      const msg = { 'one-off': "Marked one-off. It won't touch your daily budget.", kept: 'Counted in today.', counted: 'Counts as daily spending.', fixed: 'Moved to fixed monthly.' }[el.dataset.status];
      if (await run('setStatus', { id, status: el.dataset.status }, msg) && sheet.open) txSheet(id);
      break;
    }
    case 'delete-tx':
      if (confirm('Delete this payment?') && await run('deleteManual', { id }, 'Deleted')) closeSheet();
      break;
    case 'chip':
      el.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === el)));
      break;
    case 'month': {
      const [y, m] = state.month.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + Number(el.dataset.step), 1));
      state.month = d.toISOString().slice(0, 7);
      state.onlyUncategorised = false;
      render();
      break;
    }
    case 'filter': state.onlyUncategorised = !state.onlyUncategorised; render(); break;
    case 'set-budget': await run('setBudget', { dailyBudget: Number(el.dataset.value) }, 'Budget set. Your cat is awake! 🐱'); break;
    case 'goal-new': goalSheet(); break;
    case 'goal-add': contributeSheet(id); break;
    case 'goal-bought': await run('setGoalStatus', { id, status: 'bought' }, 'Enjoy it! It joins your cat’s collection. 🎉'); break;
    case 'goal-remove':
      if (confirm('Remove this goal? Its savings go back to spare cash.')) await run('setGoalStatus', { id, status: 'deleted' }, 'Goal removed');
      break;
    case 'disconnect':
      if (confirm('Disconnect this phone?')) { clearConnection(); state.data = null; state.tab = 'home'; render(); }
      break;
    case 'demo':
      saveConnection({ demo: true });
      state.data = await call('data');
      render();
      break;
  }
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const chip = group => form.querySelector(`[data-chip-group="${group}"] [aria-pressed="true"]`)?.dataset.value;
  switch (form.dataset.form) {
    case 'connect':
      saveConnection({ url: f.url.trim(), key: f.key.trim() });
      if (!(await run('data', {}, 'Connected 🎉'))) clearConnection();
      render();
      break;
    case 'add': {
      const date = new Date(f.when + ':00+08:00').toISOString();
      if (await run('addManual', { amount: Number(f.amount), merchant: f.merchant, category: chip('category'), date }, 'Added')) closeSheet();
      break;
    }
    case 'goal':
      if (await run('addGoal', { name: f.name, target: Number(f.target), emoji: chip('emoji') }, 'Goal created')) closeSheet();
      break;
    case 'contribute':
      if (await run('contribute', { id: form.dataset.id, amount: Number(f.amount) }, 'Saved toward your goal 🪙')) closeSheet();
      break;
    case 'budget':
      await run('setBudget', { dailyBudget: Number(f.dailyBudget) }, 'Budget saved');
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && getConnection() && state.data) run('data');
});

// ---------- Start ----------

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const conn = getConnection();
  if (!conn) { render(); return; }
  if (!conn.demo) state.data = cachedData();
  render();
  await run('data');
}

start();
