// Budget maths. Pure functions, no DOM, so they can be tested locally
// (tests/run-budget-tests.js).

export const SG_MS = 8 * 3600 * 1000;
export const SPREAD_DAYS = 7;          // overspend is paid back over this many days
export const ONE_OFF_MULTIPLIER = 3;   // a charge over 3x the daily budget asks "one-off?"
export const MONITORING_DAYS = 14;
export const LIKELY_ONE_OFF = 150;     // ignored when suggesting a budget

export const TIERS = [
  { tier: 1, name: 'Broke', min: -Infinity },
  { tier: 2, name: 'Struggling', min: -1 },
  { tier: 3, name: 'Getting by', min: 0 },
  { tier: 4, name: 'Comfortable', min: 5 },
  { tier: 5, name: 'Wealthy', min: 20 },
];

/** 'YYYY-MM-DD' in Singapore time. */
export function dayKey(date) {
  return new Date(new Date(date).getTime() + SG_MS).toISOString().slice(0, 10);
}

export function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((new Date(toKey + 'T00:00:00Z') - new Date(fromKey + 'T00:00:00Z')) / 86400000);
}

/** Counts against the daily budget. */
export function isDaily(tx) {
  return tx.status === 'counted' || tx.status === 'kept';
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function spentByDay(transactions) {
  const out = {};
  for (const tx of transactions) {
    if (!isDaily(tx)) continue;
    const k = dayKey(tx.date);
    out[k] = (out[k] || 0) + tx.amount;
  }
  return out;
}

export function tierFor(score) {
  let result = TIERS[0];
  for (const t of TIERS) if (score >= t.min) result = t;
  return result;
}

/** Average daily spend over the last 14 full days with data, ignoring big one-offs. */
export function suggestBudget(transactions, now) {
  const today = dayKey(now);
  const daily = transactions.filter(tx => isDaily(tx) && tx.amount <= LIKELY_ONE_OFF);
  if (!daily.length) return null;
  const firstDay = daily.map(tx => dayKey(tx.date)).sort()[0];
  const from = [firstDay, addDays(today, -MONITORING_DAYS)].sort()[1];
  const days = daysBetween(from, today); // full days, excluding today
  if (days < 3) return null;
  const total = daily
    .filter(tx => { const k = dayKey(tx.date); return k >= from && k < today; })
    .reduce((sum, tx) => sum + tx.amount, 0);
  const average = total / days;
  return { average: round2(average), suggested: Math.max(5, Math.round(average * 0.9)), days };
}

/**
 * Everything the home screen needs.
 * Spare cash = leftovers from closed days − money put into goals (active or bought).
 * Wealth     = spare cash + money sitting in active goals.
 * Score      = (wealth − overspend still being paid back − today's overspend) / daily budget,
 *              i.e. "days of budget in hand". It picks the cat's tier.
 */
export function computeBudget({ transactions, settings, goals, now }) {
  const today = dayKey(now);
  const spent = spentByDay(transactions);
  const todaySpent = round2(spent[today] || 0);
  const budget = Number(settings.dailyBudget) || 0;
  const goalSavedAll = goals.reduce((s, g) => s + g.saved, 0);
  const goalSavedActive = goals.filter(g => g.status === 'active').reduce((s, g) => s + g.saved, 0);

  if (!budget) {
    const started = settings.monitoringStarted ? dayKey(settings.monitoringStarted) : today;
    const dayNumber = daysBetween(started, today) + 1;
    return {
      mode: 'monitoring',
      today, todaySpent,
      monitoringDay: dayNumber,
      monitoringDaysLeft: Math.max(0, MONITORING_DAYS - dayNumber + 1),
      suggestion: suggestBudget(transactions, now),
      tier: TIERS[2],
      oneOffCandidates: [],
      days: [],
    };
  }

  const start = settings.budgetStarted ? dayKey(settings.budgetStarted) : today;
  const penalty = {};
  const days = [];
  let leftoverTotal = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const allowance = budget - (penalty[d] || 0);
    const daySpent = spent[d] || 0;
    const left = allowance - daySpent;
    if (d < today) {
      if (left >= 0) leftoverTotal += left;
      else for (let i = 1; i <= SPREAD_DAYS; i++) {
        const k = addDays(d, i);
        penalty[k] = (penalty[k] || 0) - left / SPREAD_DAYS;
      }
    }
    days.push({ day: d, allowance: round2(allowance), spent: round2(daySpent), left: round2(left) });
  }

  const todayRow = days[days.length - 1];
  const debt = Object.keys(penalty).filter(k => k > today).reduce((s, k) => s + penalty[k], 0);
  const spareCash = leftoverTotal - goalSavedAll;
  const wealth = spareCash + goalSavedActive;
  const score = (wealth - debt + Math.min(todayRow.left, 0)) / budget;

  let streak = 0;
  for (let i = days.length - 2; i >= 0 && days[i].left >= 0; i--) streak++;

  return {
    mode: 'budget',
    today, todaySpent,
    budget,
    allowance: todayRow.allowance,
    remaining: todayRow.left,
    spareCash: round2(spareCash),
    wealth: round2(wealth),
    debt: round2(debt),
    score: Math.round(score * 10) / 10,
    tier: tierFor(score),
    yesterday: days.length > 1 ? days[days.length - 2] : null,
    streak,
    oneOffCandidates: transactions.filter(tx =>
      tx.status === 'counted' && tx.amount > ONE_OFF_MULTIPLIER * budget && dayKey(tx.date) >= start),
    days,
  };
}

/** Spending per category for one month ('YYYY-MM'), largest first. */
export function monthBreakdown(transactions, month) {
  const byCat = {};
  let daily = 0, oneOff = 0, fixed = 0;
  for (const tx of transactions) {
    if (dayKey(tx.date).slice(0, 7) !== month) continue;
    byCat[tx.category] = (byCat[tx.category] || 0) + tx.amount;
    if (isDaily(tx)) daily += tx.amount;
    else if (tx.status === 'one-off') oneOff += tx.amount;
    else if (tx.status === 'fixed') fixed += tx.amount;
  }
  const categories = Object.entries(byCat)
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  return { categories, daily: round2(daily), oneOff: round2(oneOff), fixed: round2(fixed), total: round2(daily + oneOff + fixed) };
}
