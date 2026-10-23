// Sample data for "Try with sample data". Dates are relative to today so the
// demo always looks current.

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Travel', 'Entertainment', 'Health', 'Transfers to people', 'Other', 'Uncategorised'];

export function DEMO_DATA() {
  const at = (daysAgo, hhmm) => {
    const sg = new Date(Date.now() + 8 * 3600 * 1000);
    sg.setUTCDate(sg.getUTCDate() - daysAgo);
    const [h, m] = hhmm.split(':').map(Number);
    sg.setUTCHours(h - 8, m, 0, 0);
    return sg.toISOString();
  };
  let n = 0;
  const tx = (daysAgo, time, amount, merchant, category, source, extra = {}) => ({
    id: 'demo-' + (n++), date: at(daysAgo, time), amount, merchant, category, source,
    card: source === 'Citi' ? 'Citi PremierMiles 9626' : source === 'Trust' ? 'Trust Link' : source,
    notes: '', status: 'counted', ...extra,
  });

  const transactions = [
    tx(0, '08:10', 4.2, 'YA KUN KAYA TOAST', 'Food', 'PayLah'),
    tx(0, '12:35', 8.5, 'ZHONG JI', 'Food', 'PayLah'),
    tx(1, '13:35', 48.3, 'AISG INVESTMENT HOLDING PTE. LTD.', 'Shopping', 'PayLah', { notes: 'Lazada: Your order has shipped' }),
    tx(1, '16:02', 2.5, 'FOMO PAY PTE. LTD.', 'Uncategorised', 'PayLah'),
    tx(2, '19:20', 21.4, "McDonald's - Potong Pasir", 'Food', 'Grab', { notes: 'GrabFood: 1x Double Cheeseburger Meal', card: 'Grab' }),
    tx(3, '12:20', 10.2, 'ZHONG JI', 'Food', 'PayLah'),
    tx(3, '18:45', 14.2, 'JustGrab', 'Transport', 'Grab', { card: 'Grab' }),
    tx(4, '20:05', 18.9, 'Pastamania - Bishan', 'Food', 'Grab', { notes: 'GrabFood: 1x Carbonara', card: 'Grab' }),
    tx(5, '17:15', 66.44, 'NTUC FP - CITY SQUARE SINGAPORE SG', 'Groceries', 'Trust'),
    tx(6, '19:03', 23.5, "McDonald's - Potong Pasir", 'Food', 'Grab', { notes: 'GrabFood: 1x Dbl Quarter Pounder', card: 'Grab' }),
    tx(8, '12:40', 6.8, 'KOUFU PTE LTD', 'Food', 'PayLah'),
    tx(9, '21:10', 15.9, 'NETFLIX.COM', 'Entertainment', 'Citi', { status: 'fixed' }),
    tx(10, '13:00', 9.3, 'ZHONG JI', 'Food', 'PayLah'),
    tx(12, '23:37', 747.28, 'AGODA.COM Hong Kong HKG', 'Travel', 'Citi', { status: 'one-off' }),
    tx(13, '18:30', 32.1, 'DON DON DONKI', 'Groceries', 'Trust'),
  ];

  return {
    transactions,
    goals: [
      { id: 'goal-demo-1', name: 'Japan trip', emoji: '🗾', target: 800, saved: 20, created: at(10, '09:00'), status: 'active' },
      { id: 'goal-demo-2', name: 'New headphones', emoji: '🎧', target: 250, saved: 10, created: at(5, '09:00'), status: 'active' },
    ],
    settings: { dailyBudget: 30, budgetStarted: at(7, '09:00'), monitoringStarted: at(14, '09:00') },
    categories: CATEGORIES,
  };
}
