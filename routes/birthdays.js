const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { fmt } = require('../lib/events');
const { MONTHS_IS } = require('../lib/format');
const { eventTypeLabel } = require('../lib/labels');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

function monthParam(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// A calendar view of the month, since "Öll tilefni" already has the full
// table (status, budget, delivery) for every occasion - this page is just
// meant to give HR a quick, at-a-glance look at what's happening when,
// across every occasion type (afmæli, jól, sértilefni). No actions here on
// purpose - Beron handles gift ordering automatically in the background
// (see lib/events.js); custom occasions are created from Öll tilefni.
router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const company = store.find('companies', companyId);
  const today = new Date();

  let year = today.getFullYear();
  let month = today.getMonth();
  if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
    const parts = req.query.month.split('-').map(Number);
    year = parts[0];
    month = parts[1] - 1;
  }

  // Every occasion on the books for this company. Skipped/cancelled ones are
  // left off the calendar since they're not actually happening anymore.
  const events = store.where('events', (e) => e.company_id === companyId && e.status !== 'skipped');
  const employeesById = new Map(store.where('employees', (e) => e.company_id === companyId).map((e) => [e.id, e]));

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Icelandic weeks start on Monday - shift JS's Sunday-first getDay() (0-6)
  // so Monday is 0 and Sunday is 6.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const trailingBlanks = (7 - ((lastOfMonth.getDay() + 6) % 7) - 1) % 7;

  const gridStart = new Date(year, month, 1 - leadingBlanks);
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + trailingBlanks);

  function occasionsOn(date) {
    const dateStr = fmt(date);
    return events
      .filter((e) => e.date === dateStr)
      .map((e) => {
        const emp = e.employee_id ? employeesById.get(e.employee_id) : null;
        const label = emp ? emp.name : e.custom_label || eventTypeLabel(e.event_type);
        const sub = e.event_type === 'custom' ? e.custom_label : (emp && emp.department) || null;
        return { type: e.event_type, label, sub };
      });
  }

  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    days.push({
      date,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: fmt(date) === fmt(today),
      occasions: occasionsOn(date)
    });
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const occasionsThisMonth = events.filter((e) => {
    const parts = e.date.split('-').map(Number);
    return parts[0] === year && parts[1] - 1 === month;
  }).length;

  res.render('birthdays', {
    weeks,
    company,
    monthLabel: `${MONTHS_IS[month]} ${year}`,
    occasionsThisMonth,
    prevMonthParam: monthParam(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1),
    nextMonthParam: monthParam(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1),
    todayMonthParam: monthParam(today.getFullYear(), today.getMonth()),
    isCurrentMonthView: year === today.getFullYear() && month === today.getMonth()
  });
});

module.exports = router;
