const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { runDailyWorkflows, daysBetween, NOTE_CUTOFF_DAYS } = require('../lib/events');
const { computeInvoice } = require('../lib/pricing');
const { billingForCompanyMonth } = require('../lib/billing');
const { eventTypeLabel } = require('../lib/labels');
const { getCompanyNotifications } = require('../lib/notifications');

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

  // "Í vinnslu núna" - only orders that are actually moving (ordered or
  // shipped), not the full pending backlog of far-future birthdays that
  // haven't been touched yet. Since most companies only ever have one or
  // two gifts genuinely in flight at once, a full 5-stage pipeline count
  // was more confusing than useful - a short list of what's actually
  // happening right now is more actionable.
  const allOrders = store.where('giftOrders', (o) => o.company_id === companyId);
  const eventsById = new Map(store.where('events', (e) => e.company_id === companyId).map((e) => [e.id, e]));
  const activeOrders = allOrders
    .filter((o) => o.status === 'ordered' || o.status === 'shipped')
    .map((o) => {
      const emp = o.employee_id ? store.find('employees', o.employee_id) : null;
      const event = o.event_id ? eventsById.get(o.event_id) : null;
      const relevantDate = o.gift_type === 'custom' ? o.delivery_date : (event ? event.date : null);
      return {
        name: emp ? emp.name : 'Óþekkt',
        typeLabel: o.occasion || eventTypeLabel(o.gift_type),
        status: o.status,
        date: relevantDate
      };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const invoice = computeInvoice(company.subscription_plan, activeEmployees.length);
  const monthBilling = billingForCompanyMonth(company, today.getFullYear(), today.getMonth());
  const notifications = getCompanyNotifications(companyId, today);

  res.render('dashboard', {
    company,
    upcomingEvents,
    occasionsNext30Count,
    missingBudgetCount,
    activeEmployeeCount: activeEmployees.length,
    activeOrders,
    invoice,
    monthBilling,
    notifications,
    error: req.query.error,
    NOTE_CUTOFF_DAYS
  });
});

module.exports = router;
