const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { runDailyWorkflows, upcomingEventsForCompany, daysBetween, NOTE_CUTOFF_DAYS } = require('../lib/events');
const { computeInvoice } = require('../lib/pricing');
const { billingForCompanyMonth } = require('../lib/billing');

const router = express.Router();

router.get('/', requireLogin, requireCompanyAdmin, (req, res) => {
  const companyId = req.session.user.company_id;
  runDailyWorkflows(companyId);

  const company = store.find('companies', companyId);
  const today = new Date();

  const ordersByEvent = new Map(
    store.where('giftOrders', (o) => o.company_id === companyId && o.event_id).map((o) => [o.event_id, o])
  );

  const upcomingEvents = upcomingEventsForCompany(companyId, 30, today)
    .filter((ev) => ev.event_type === 'birthday' || ev.event_type === 'christmas')
    .map((ev) => {
      const emp = store.find('employees', ev.employee_id);
      const diff = daysBetween(today, new Date(ev.date + 'T00:00:00'));
      return Object.assign({}, ev, {
        employee: emp,
        daysAway: diff,
        order: ordersByEvent.get(ev.id) || null,
        canEditNote: diff >= NOTE_CUTOFF_DAYS
      });
    })
    .sort((a, b) => a.daysAway - b.daysAway);

  const upcomingChristmas = upcomingEvents.filter((e) => e.event_type === 'christmas');

  const activeEmployees = store.where('employees', (e) => e.company_id === companyId && e.active);
  const missingBudgetCount = activeEmployees.filter((e) => !e.birthday_budget).length;

  const recentOrders = store
    .where('giftOrders', (o) => o.company_id === companyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map((o) => Object.assign({}, o, { employee: o.employee_id ? store.find('employees', o.employee_id) : null }));

  const invoice = computeInvoice(company.subscription_plan, activeEmployees.length);
  const monthBilling = billingForCompanyMonth(company, today.getFullYear(), today.getMonth());

  const christmasCountdown = (() => {
    if (company.subscription_plan !== 'birthdays_christmas') return null;
    let year = today.getFullYear();
    let xmas = new Date(year, 11, 24);
    if (xmas < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      xmas = new Date(year + 1, 11, 24);
    }
    return daysBetween(today, xmas);
  })();

  res.render('dashboard', {
    company,
    upcomingEvents,
    missingBudgetCount,
    upcomingChristmas,
    christmasCountdown,
    recentOrders,
    invoice,
    monthBilling,
    error: req.query.error,
    NOTE_CUTOFF_DAYS
  });
});

module.exports = router;
