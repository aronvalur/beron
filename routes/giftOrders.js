const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { CUSTOM_HANDLING_FEE } = require('../lib/pricing');
const { daysBetween, runDailyWorkflows, NOTE_CUTOFF_DAYS, CANCEL_CUTOFF_DAYS } = require('../lib/events');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

function daysAwayFor(order, event) {
  const relevantDate = order.gift_type === 'custom' ? order.delivery_date : (event ? event.date : null);
  if (!relevantDate) return null;
  return daysBetween(new Date(), new Date(relevantDate + 'T00:00:00'));
}

// Gjafapantanir is the one place HR looks for both "what's coming up" and
// "what's the status" - it used to be split across a separate Tilefni page,
// but that just duplicated this table with slightly different columns.
router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  runDailyWorkflows(companyId);

  const filter = req.query.type || 'all';
  const range = req.query.range || 'all';
  const today = new Date();

  let orders = store.where('giftOrders', (o) => o.company_id === companyId);
  if (filter !== 'all') orders = orders.filter((o) => o.gift_type === filter);

  orders = orders.map((o) => {
    const event = o.event_id ? store.find('events', o.event_id) : null;
    const daysAway = daysAwayFor(o, event);
    const canCancel =
      o.gift_type === 'custom' &&
      !['delivered', 'cancelled'].includes(o.status) &&
      daysAway !== null &&
      daysAway >= CANCEL_CUTOFF_DAYS;
    const canSkip =
      (o.gift_type === 'birthday' || o.gift_type === 'christmas') &&
      event &&
      event.status === 'upcoming' &&
      !['delivered', 'cancelled'].includes(o.status);
    const canEditNote = daysAway === null || daysAway >= NOTE_CUTOFF_DAYS;
    // A cancelled/skipped order can be brought back as long as there's
    // still time to act on it - same lead-time rule as the action that
    // cancelled it in the first place.
    const canRestore =
      o.status === 'cancelled' &&
      daysAway !== null &&
      daysAway >= (o.gift_type === 'custom' ? CANCEL_CUTOFF_DAYS : 0);
    return Object.assign({}, o, {
      employee: o.employee_id ? store.find('employees', o.employee_id) : null,
      event,
      daysAway,
      canCancel,
      canSkip,
      canEditNote,
      canRestore
    });
  });

  // Quick date-range shortcuts, in addition to the gift-type filter above -
  // "Í dag"/"7 dagar" look at how many days out the event is, "Þessi mánuð"
  // matches the calendar month regardless of year (so a mid-month order from
  // a couple weeks ago still shows up under this month too).
  if (range === 'today') {
    orders = orders.filter((o) => o.daysAway === 0);
  } else if (range === '7') {
    orders = orders.filter((o) => o.daysAway !== null && o.daysAway >= 0 && o.daysAway <= 7);
  } else if (range === 'month') {
    orders = orders.filter((o) => {
      if (!o.event) return false;
      const d = new Date(o.event.date + 'T00:00:00');
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    });
  }

  // Soonest first - this is an "upcoming" list, so chronological order by
  // event/delivery date makes more sense here than by when the order was
  // created.
  orders.sort((a, b) => {
    if (a.daysAway === null) return 1;
    if (b.daysAway === null) return -1;
    return a.daysAway - b.daysAway;
  });

  res.render('gift-orders/index', {
    orders,
    filter,
    range,
    error: req.query.error,
    cancelled: req.query.cancelled === '1',
    skipped: req.query.skipped === '1',
    restored: req.query.restored === '1',
    NOTE_CUTOFF_DAYS
  });
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

// HR can opt an employee out of an automatic birthday/Christmas gift
// (e.g. someone on leave) - this skips the underlying event and cancels
// its linked order. No lead-time cutoff here since it's just an opt-out,
// not an in-progress custom order.
router.post('/:id/skip', (req, res) => {
  const order = store.find('giftOrders', req.params.id);
  if (!order || order.company_id !== req.session.user.company_id) {
    return res.status(404).render('error', { message: 'Pöntun fannst ekki.' });
  }
  if (order.gift_type !== 'birthday' && order.gift_type !== 'christmas') {
    return res.redirect('/gift-orders?error=' + encodeURIComponent('Aðeins hægt að sleppa afmælis- og jólagjöfum.'));
  }
  if (order.event_id) {
    store.update('events', order.event_id, { status: 'skipped' });
  }
  store.update('giftOrders', order.id, { status: 'cancelled' });
  res.redirect('/gift-orders?skipped=1');
});

// Undo a cancel/skip - only while there's still enough lead time to act on
// it (same cutoff as the cancel/skip action itself), so this can't be used
// to sneak a change in past the point where Beron already moved on.
router.post('/:id/restore', (req, res) => {
  const order = store.find('giftOrders', req.params.id);
  if (!order || order.company_id !== req.session.user.company_id) {
    return res.status(404).render('error', { message: 'Pöntun fannst ekki.' });
  }
  if (order.status !== 'cancelled') {
    return res.redirect('/gift-orders?error=' + encodeURIComponent('Þessi pöntun er ekki afturkölluð.'));
  }

  const event = order.event_id ? store.find('events', order.event_id) : null;
  const daysAway = daysAwayFor(order, event);
  const cutoff = order.gift_type === 'custom' ? CANCEL_CUTOFF_DAYS : 0;
  if (daysAway === null || daysAway < cutoff) {
    return res.redirect(
      '/gift-orders?error=' + encodeURIComponent('Of seint að taka til baka - dagsetningin er of nálægt eða liðin.')
    );
  }

  store.update('giftOrders', order.id, { status: 'pending' });
  if (event && event.status === 'skipped') {
    store.update('events', event.id, { status: 'upcoming' });
  }
  res.redirect('/gift-orders?restored=1');
});

module.exports = router;
