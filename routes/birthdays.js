const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { fmt } = require('../lib/events');
const { MONTHS_IS } = require('../lib/format');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

function monthParam(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// A calendar view of the month, since "Öll tilefni" already has the full
// table (status, budget, delivery) for every birthday - this page is just
// meant to give HR a quick, at-a-glance look at who has a birthday coming up
// and when, month by month. No actions here on purpose - Beron handles gift
// ordering automatically in the background (see lib/events.js).
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

  const employees = store.where('employees', (e) => e.company_id === companyId && e.active && e.birthday);

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Icelandic weeks start on Monday - shift JS's Sunday-first getDay() (0-6)
  // so Monday is 0 and Sunday is 6.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const trailingBlanks = (7 - ((lastOfMonth.getDay() + 6) % 7) - 1) % 7;

  const gridStart = new Date(year, month, 1 - leadingBlanks);
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + trailingBlanks);

  const days = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const birthdays = employees.filter((e) => {
      const parts = e.birthday.split('-').map(Number);
      return parts[1] - 1 === date.getMonth() && parts[2] === date.getDate();
    });
    days.push({
      date,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: fmt(date) === fmt(today),
      birthdays
    });
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const birthdaysThisMonth = employees.filter((e) => Number(e.birthday.split('-')[1]) - 1 === month).length;

  res.render('birthdays', {
    weeks,
    company,
    monthLabel: `${MONTHS_IS[month]} ${year}`,
    birthdaysThisMonth,
    prevMonthParam: monthParam(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1),
    nextMonthParam: monthParam(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1),
    todayMonthParam: monthParam(today.getFullYear(), today.getMonth()),
    isCurrentMonthView: year === today.getFullYear() && month === today.getMonth()
  });
});

module.exports = router;
