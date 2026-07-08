const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { CUSTOM_HANDLING_FEE } = require('../lib/pricing');
const { daysBetween, NOTE_CUTOFF_DAYS, CANCEL_CUTOFF_DAYS } = require('../lib/events');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

function daysAwayFor(order, event) {
  const relevantDate = order.gift_type === 'custom' ? order.delivery_date : (event ? event.date : null);
  if (!relevantDate) return null;
  return daysBetween(new Date(), new Date(relevantDate + 'T00:00:00'));
}

router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const orders = store
    .where('giftOrders', (o) => o.company_id === companyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((o) => {
      const event = o.event_id ? store.find('events', o.event_id) : null;
      const daysAway = daysAwayFor(o, event);
      const canCancel =
        o.gift_type === 'custom' &&
        !['delivered', 'cancelled'].includes(o.status) &&
        daysAway !== null &&
        daysAway >= CANCEL_CUTOFF_DAYS;
      return Object.assign({}, o, { employee: o.employee_id ? store.find('employees', o.employee_id) : null, event, daysAway, canCancel });
    });
  res.render('gift-orders/index', { orders, error: req.query.error, cancelled: req.query.cancelled === '1' });
});

router.get('/custom/new', (req, res) => {
  const companyId = req.session.user.company_id;
  const employees = store.where('employees', (e) => e.company_id === companyId && e.active);
  res.render('gift-orders/custom-form', { employees, handlingFee: CUSTOM_HANDLING_FEE });
});

router.post('/custom', (req, res) => {
  const companyId = req.session.user.company_id;
  const b = req.body;
  const deliveryDate = b.delivery_date || new Date().toISOString().slice(0, 10);

  const event = store.insert('events', {
    company_id: companyId,
    employee_id: b.employee_id ? Number(b.employee_id) : null,
    event_type: 'custom',
    date: deliveryDate,
    status: 'upcoming',
    custom_label: b.occasion || 'Sértilefni'
  });

  store.insert('giftOrders', {
    company_id: companyId,
    employee_id: b.employee_id ? Number(b.employee_id) : null,
    event_id: event.id,
    gift_type: 'custom',
    budget_amount: b.budget_amount ? Number(b.budget_amount) : null,
    handling_fee: CUSTOM_HANDLING_FEE,
    delivery_date: deliveryDate,
    status: 'pending',
    fulfillment_method: 'manual',
    delivery_method: b.delivery_method || 'to_employee',
    notes: b.notes || '',
    occasion: b.occasion || 'Sértilefni'
  });

  res.redirect('/gift-orders');
});

// Note: company admins cannot change a gift order's fulfillment status -
// that's Beron HQ's job (see routes/superadmin.js). This page is read-only
// for HR so they can track progress without controlling it.

// HR *can* add a note to any of their gift orders (e.g. "she loves dark
// chocolate" or "deliver before 2pm, he's off after that") - this is
// informational for Beron's fulfillment team, not a status change. Only
// allowed while the event is still NOTE_CUTOFF_DAYS or more away, so
// Beron isn't chasing last-minute edits once fulfillment has likely begun.
router.post('/:id/note', (req, res) => {
  const order = store.find('giftOrders', req.params.id);
  if (!order || order.company_id !== req.session.user.company_id) {
    return res.status(404).render('error', { message: 'Pöntun fannst ekki.' });
  }
  const event = order.event_id ? store.find('events', order.event_id) : null;
  const daysAway = daysAwayFor(order, event);
  const redirectBase = req.body.redirect_to || '/gift-orders';

  if (daysAway !== null && daysAway < NOTE_CUTOFF_DAYS) {
    const sep = redirectBase.includes('?') ? '&' : '?';
    return res.redirect(
      redirectBase + sep + 'error=' + encodeURIComponent(`Of seint að breyta athugasemd - þarf að gerast minnst ${NOTE_CUTOFF_DAYS} dögum fyrir.`)
    );
  }

  store.update('giftOrders', order.id, { notes: req.body.notes || '' });
  res.redirect(redirectBase);
});

// HR can cancel a sérpöntun (custom order) themselves, but only while
// there's still enough lead time (CANCEL_CUTOFF_DAYS) before the delivery
// date - after that Beron has likely already bought/prepared the gift.
router.post('/:id/cancel', (req, res) => {
  const order = store.find('giftOrders', req.params.id);
  if (!order || order.company_id !== req.session.user.company_id) {
    return res.status(404).render('error', { message: 'Pöntun fannst ekki.' });
  }
  if (order.gift_type !== 'custom') {
    return res.redirect('/gift-orders?error=' + encodeURIComponent('Aðeins hægt að hætta við sérpantanir hér.'));
  }

  const daysAway = daysAwayFor(order, null);
  if (daysAway === null || daysAway < CANCEL_CUTOFF_DAYS) {
    return res.redirect(
      '/gift-orders?error=' + encodeURIComponent(`Of seint að hætta við - þarf að gerast minnst ${CANCEL_CUTOFF_DAYS} dögum fyrir afhendingu.`)
    );
  }

  store.update('giftOrders', order.id, { status: 'cancelled' });
  res.redirect('/gift-orders?cancelled=1');
});

module.exports = router;
