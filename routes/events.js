const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { runDailyWorkflows } = require('../lib/events');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  runDailyWorkflows(companyId);

  const filter = req.query.type || 'all';
  let events = store.where('events', (e) => e.company_id === companyId);
  if (filter !== 'all') events = events.filter((e) => e.event_type === filter);

  const ordersByEvent = new Map(
    store.where('giftOrders', (o) => o.company_id === companyId && o.event_id).map((o) => [o.event_id, o])
  );

  events = events
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((e) =>
      Object.assign({}, e, {
        employee: e.employee_id ? store.find('employees', e.employee_id) : null,
        order: ordersByEvent.get(e.id) || null
      })
    );

  res.render('events/index', { events, filter });
});

// HR doesn't create birthday/Christmas gift orders manually - Beron creates
// them automatically as soon as the event becomes upcoming (see
// lib/events.js -> ensureGiftOrdersForEvents). The only manual action left
// here is opting an employee out of a specific occasion.
router.post('/:id/skip', (req, res) => {
  const event = store.find('events', req.params.id);
  if (event && event.company_id === req.session.user.company_id) {
    store.update('events', event.id, { status: 'skipped' });
    const order = store.where(
      'giftOrders',
      (o) => o.event_id === event.id && o.status === 'pending'
    )[0];
    if (order) store.update('giftOrders', order.id, { status: 'cancelled' });
  }
  res.redirect('/events');
});

module.exports = router;
