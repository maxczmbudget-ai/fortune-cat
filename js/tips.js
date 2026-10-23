// Rule-based saving tips. Each rule returns a tip or null; the first few that
// apply are shown, most useful first.

import { dayKey, addDays, isDaily, round2 } from './budget.js';

const money = n => 'S$' + n.toFixed(2);

export function buildTips({ transactions, summary, now }) {
  const today = dayKey(now);
  const weekAgo = addDays(today, -7);
  const lastWeek = transactions.filter(tx => { const k = dayKey(tx.date); return k > weekAgo && k <= today; });
  const rules = [overspentToday, deliveryHabit, lowToday, categoryJump, streak, uncategorised, monitoring];
  return rules
    .map(rule => rule({ transactions, lastWeek, summary, today }))
    .filter(Boolean)
    .slice(0, 3);
}

function overspentToday({ summary }) {
  if (summary.mode !== 'budget' || summary.remaining >= 0) return null;
  const perDay = round2(-summary.remaining / 7);
  return { icon: '⚠️', text: `You're ${money(-summary.remaining)} over today. That comes off the next 7 days, about ${money(perDay)} a day.` };
}

function deliveryHabit({ lastWeek }) {
  const orders = lastWeek.filter(tx => tx.source === 'Grab' && /food/i.test(tx.notes));
  if (orders.length < 3) return null;
  const total = orders.reduce((s, tx) => s + tx.amount, 0);
  const saving = Math.max(0, round2(2 * (total / orders.length) - 2 * 6));
  return {
    icon: '🛵',
    text: `GrabFood ${orders.length}× this week (${money(total)}).` +
      (saving > 0 ? ` Cooking or a hawker meal twice instead could save about ${money(saving)}.` : ''),
  };
}

function lowToday({ summary }) {
  if (summary.mode !== 'budget' || summary.remaining < 0 || summary.remaining > summary.budget * 0.25) return null;
  return { icon: '🍜', text: `${money(summary.remaining)} left today. Enough for a hawker meal; maybe skip the bubble tea.` };
}

function categoryJump({ transactions, today }) {
  // Same number of days this month vs the start of last month.
  const thisMonth = today.slice(0, 7);
  const dayOfMonth = +today.slice(8, 10);
  if (dayOfMonth < 7) return null;
  const lastMonthStart = addDays(thisMonth + '-01', -1).slice(0, 7);
  const sum = (month) => {
    const out = {};
    for (const tx of transactions) {
      const k = dayKey(tx.date);
      if (!isDaily(tx) || k.slice(0, 7) !== month || +k.slice(8, 10) > dayOfMonth) continue;
      out[tx.category] = (out[tx.category] || 0) + tx.amount;
    }
    return out;
  };
  const now = sum(thisMonth), before = sum(lastMonthStart);
  let worst = null;
  for (const [cat, total] of Object.entries(now)) {
    const prev = before[cat] || 0;
    if (prev < 20 || total < prev * 1.3) continue;
    if (!worst || total - prev > worst.diff) worst = { cat, diff: total - prev, pct: Math.round((total / prev - 1) * 100) };
  }
  if (!worst) return null;
  return { icon: '📈', text: `${worst.cat} is up ${worst.pct}% on this point last month (+${money(worst.diff)}).` };
}

function streak({ summary }) {
  if (summary.mode !== 'budget' || summary.streak < 3) return null;
  return { icon: '🔥', text: `${summary.streak} days under budget in a row. Your cat is getting shinier.` };
}

function uncategorised({ transactions }) {
  const n = transactions.filter(tx => tx.category === 'Uncategorised').length;
  if (!n) return null;
  return { icon: '🏷️', text: `${n} payment${n > 1 ? 's need' : ' needs'} a category. Tap them in History.` };
}

function monitoring({ summary }) {
  if (summary.mode !== 'monitoring') return null;
  if (summary.monitoringDaysLeft > 0) {
    return { icon: '👀', text: `Day ${summary.monitoringDay} of ${summary.monitoringDay + summary.monitoringDaysLeft - 1}: just spend as usual. I'll suggest a daily budget at the end.` };
  }
  return summary.suggestion
    ? { icon: '🎯', text: `You average ${money(summary.suggestion.average)} a day. Set a daily budget in Settings to wake your cat up.` }
    : null;
}
