const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { runDailyWorkflows, daysBetween, NOTE_CUTOFF_DAYS } = require('../lib/events');
const { computeInvoice } = require('../lib/pricing');
const { billingForCompanyMonth } = require('../lib/billing');
const { eventTypeLabel } = require('../lib/labels');

const router = express.Router();

router.get('/', requireLogin, requireCompanyAdmin, (req, res) => {
  const companyId = req.session.user.company_id;
  runDailyWorkflows(companyId);

  const company = store.find('companies', companyId);
  const today = new Date();

  const ordersByEvent = new Map(
    store.where('giftOrders', (o) => o.company_id === companyId && o.event_id).map((o) => [o.event_id, o])
  );

  // The table itself shows everything happening in the next 30 days -
  // birthdays, Christmas, and sérpöntun alike - including ones that have
  // since been cancelled/skipped, so HR isn't missing anything by only
  // seeing "upcoming"-status events.
  const upcomingEvents = store
    .where('events', (e) => e.company_id === companyId)
    .filter((ev) => {
      const diff = daysBetween(today, new Date(ev.date + 'T00:00:00'));
      return diff >= -1 && diff <= 30;
    })
    .map((ev) => {
      const emp = ev.employee_id ? store.find('employees', ev.employee_id) : null;
      const diff = daysBetween(today, new Date(ev.date + 'T00:00:00'));
      return Object.assign({}, ev, {
        employee: emp,
        daysAway: diff,
        order: ordersByEvent.get(ev.id) || null,
        canEditNote: diff >= NOTE_CUTOFF_DAYS
      });
    })
    .sort((a, b) => a.daysAway - b.daysAway);

  // Same list as the "Næstu 30 dagar" table below, but only the genuinely
  // upcoming ones (excludes the -1 day lookback used to keep just-passed
  // items visible in the table) - every occasion type counts here, not
  // just birthdays/Christmas.
  const occasionsNext30Count = upcomingEvents.filter((ev) => ev.daysAway >= 0).length;

  const activeEmployees = store.where('employees', (e) => e.company_id === companyId && e.active);
  const missingBudgetCount = activeEmployees.filter((e) => !e.birthday_budget).length;

  // Fulfillment pipeline breakdown - a different axis from the date-based
  // "Næstu 30 dagar" table above: this shows where things stand regardless
  // of when the event happens, so HR can see at a glance how much is still
  // in progress vs already delivered.
  const STATUS_ORDER = ['pending', 'ordered', 'shipped', 'delivered', 'cancelled'];
  const allOrders = store.where('giftOrders', (o) => o.company_id === companyId);
  const statusCounts = STATUS_ORDER.map((status) => {
    const orders = allOrders
      .filter((o) => o.status === status)
      .map((o) => {
        const emp = o.employee_id ? store.find('employees', o.employee_id) : null;
        return {
          name: emp ? emp.name : 'Óþekkt',
          typeLabel: o.occasion || eventTypeLabel(o.gift_type)
        };
      });
    return { status, count: orders.length, orders };
  });

  const invoice = computeInvoice(company.subscription_plan, activeEmployees.length);
  const monthBilling = billingForCompanyMonth(company, today.getFullYear(), today.getMonth());

  res.render('dashboard', {
    company,
    upcomingEvents,
    occasionsNext30Count,
    missingBudgetCount,
    activeEmployeeCount: activeEmployees.length,
    statusCounts,
    invoice,
    monthBilling,
    error: req.query.error,
    NOTE_CUTOFF_DAYS
  });
});

module.exports = router;
