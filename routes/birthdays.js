const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { nextOccurrence, occurrenceInYear, daysBetween, fmt } = require('../lib/events');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

// A pure visibility view for HR: every active employee's next birthday, in a
// row, filterable by date range. No actions here on purpose - Beron handles
// gift ordering automatically in the background (see lib/events.js).
router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const today = new Date();
  const range = req.query.range || 'month';

  const employees = store.where('employees', (e) => e.company_id === companyId && e.active);

  let rows;

  if (range === 'month') {
    rows = employees
      .map((e) => {
        const occurrence = occurrenceInYear(e.birthday, today.getFullYear());
        return { employee: e, date: fmt(occurrence), daysAway: daysBetween(today, occurrence) };
      })
      .filter((r) => {
        const d = new Date(r.date + 'T00:00:00');
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && r.daysAway >= 0;
      });
  } else {
    const limit = range === '90' ? 90 : range === '30' ? 30 : Infinity;
    rows = employees
      .map((e) => {
        const occurrence = nextOccurrence(e.birthday, today);
        return { employee: e, date: fmt(occurrence), daysAway: daysBetween(today, occurrence) };
      })
      .filter((r) => r.daysAway <= limit);
  }

  rows.sort((a, b) => a.daysAway - b.daysAway);

  res.render('birthdays', { rows, range });
});

module.exports = router;
