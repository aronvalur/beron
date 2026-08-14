const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { requireLogin, requireSuperAdmin } = require('../middleware/auth');
const { runDailyWorkflows, upcomingEventsForCompany, daysBetween } = require('../lib/events');
const { computeInvoice, PLANS } = require('../lib/pricing');
const { MONTHS_IS } = require('../lib/format');
const { billingForCompanyMonth, getInvoicePayment, setInvoicePayment } = require('../lib/billing');

const router = express.Router();
router.use(requireLogin, requireSuperAdmin);

function companiesWithStats() {
  return store.all('companies').map((c) => {
    const employees = store.where('employees', (e) => e.company_id === c.id);
    const activeEmployees = employees.filter((e) => e.active);
    const pendingOrders = store.where('giftOrders', (o) => o.company_id === c.id && o.status !== 'delivered' && o.status !== 'cancelled');
    const subscription = store.where('subscriptions', (s) => s.company_id === c.id)[0];
    return {
      company: c,
      employeeCount: employees.length,
      activeEmployeeCount: activeEmployees.length,
      pendingOrderCount: pendingOrders.length,
      subscription,
      invoice: computeInvoice(c.subscription_plan, activeEmployees.length)
    };
  });
}

router.get('/', (req, res) => {
  store.all('companies').forEach((c) => runDailyWorkflows(c.id));

  const stats = companiesWithStats();
  const allPendingOrders = store.where('giftOrders', (o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const allUpcoming = store.all('companies').flatMap((c) => upcomingEventsForCompany(c.id, 30));

  // Notifications: freshly-submitted sérpöntun (still pending, so nobody's
  // acted on them yet) and unread fyrirspurnir - a quick "what needs a
  // look" bell so nothing slips through between visits to the Gjafapantanir
  // and Fyrirspurnir pages.
  const companiesById = new Map(store.all('companies').map((c) => [c.id, c]));
  const customOrderNotifications = store
    .where('giftOrders', (o) => o.gift_type === 'custom' && o.status === 'pending')
    .map((o) => Object.assign({}, o, {
      company: companiesById.get(o.company_id),
      employee: o.employee_id ? store.find('employees', o.employee_id) : null
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const inquiryNotifications = store
    .where('meetingRequests', (m) => m.status === 'new')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.render('superadmin/index', {
    companyCount: stats.length,
    totalActiveEmployees: stats.reduce((sum, s) => sum + s.activeEmployeeCount, 0),
    pendingOrderCount: allPendingOrders.length,
    upcomingEventCount: allUpcoming.length,
    stats,
    customOrderNotifications,
    inquiryNotifications,
    notificationCount: customOrderNotifications.length + inquiryNotifications.length
  });
});

router.get('/companies', (req, res) => {
  res.render('superadmin/companies', { stats: companiesWithStats() });
});

// Onboarding a brand-new customer: creates the company, its subscription,
// and its first contact login in one go. Beron HQ sets an easy temporary
// password here (defaults to beron123) - it's shown once on the next page
// so it can be relayed to the customer, who can then change it themselves
// under Stillingar once they log in.
router.get('/companies/new', (req, res) => {
  res.render('superadmin/company-new', { PLANS, error: req.query.error, formValues: {} });
});

router.post('/companies', (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  const kennitala = (b.kennitala || '').trim();
  const billingEmail = (b.billing_email || '').trim();
  const billingAddress = (b.billing_address || '').trim();
  const plan = PLANS[b.subscription_plan] ? b.subscription_plan : 'birthdays';
  const contactName = (b.contact_name || '').trim();
  const contactEmail = (b.contact_email || '').trim();
  const contactPhone = (b.contact_phone || '').trim();
  const password = (b.password || '').trim() || 'beron123';

  if (!name || !contactName || !contactEmail) {
    return res.status(400).render('superadmin/company-new', {
      PLANS,
      error: 'Nafn fyrirtækis, nafn tengiliðar og netfang tengiliðar eru nauðsynleg.',
      formValues: { name, kennitala, billing_email: billingEmail, billing_address: billingAddress, subscription_plan: plan, contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone }
    });
  }

  const emailTaken = store.where('users', (u) => u.email.toLowerCase() === contactEmail.toLowerCase());
  if (emailTaken.length > 0) {
    return res.status(400).render('superadmin/company-new', {
      PLANS,
      error: 'Þetta netfang er þegar í notkun.',
      formValues: { name, kennitala, billing_email: billingEmail, billing_address: billingAddress, subscription_plan: plan, contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone }
    });
  }

  const company = store.insert('companies', {
    name,
    kennitala,
    subscription_plan: plan,
    billing_email: billingEmail,
    billing_address: billingAddress,
    active_admin_count: 1,
    email_notifications: false
  });

  store.insert('subscriptions', {
    company_id: company.id,
    plan_type: plan,
    pricing_model: 'per_employee',
    price_per_employee: PLANS[plan].pricePerEmployee,
    monthly_fee: null,
    active: true
  });

  store.insert('users', {
    name: contactName,
    email: contactEmail,
    phone: contactPhone,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'admin',
    company_id: company.id
  });

  res.redirect(`/superadmin/companies/${company.id}?created=1&pwd=${encodeURIComponent(password)}`);
});

router.get('/companies/:id', (req, res) => {
  const company = store.find('companies', req.params.id);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });
  const employees = store.where('employees', (e) => e.company_id === company.id);
  const orders = store.where('giftOrders', (o) => o.company_id === company.id);
  const admins = store.where('users', (u) => u.company_id === company.id && u.role === 'admin');
  const subscription = store.where('subscriptions', (s) => s.company_id === company.id)[0];
  const plan = PLANS[company.subscription_plan] || null;
  res.render('superadmin/company-detail', {
    company,
    employees,
    orders,
    admins,
    subscription,
    plan,
    PLANS,
    justCreated: req.query.created === '1',
    newPassword: req.query.pwd || null,
    justReset: req.query.reset === '1',
    resetEmail: req.query.email || null,
    saved: req.query.saved === '1',
    loginError: req.query.error || null
  });
});

// Beron HQ editing a company's own on-file info (name, kennitala, billing
// details, plan) after it's already been created - separate from the HR
// contact's own /billing page, since a company might call in and ask HQ to
// fix something for them directly instead of doing it themselves.
router.put('/companies/:id', (req, res) => {
  const company = store.find('companies', req.params.id);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });
  const b = req.body;
  const plan = PLANS[b.subscription_plan] ? b.subscription_plan : company.subscription_plan;

  store.update('companies', company.id, {
    name: (b.name || '').trim() || company.name,
    kennitala: (b.kennitala || '').trim(),
    billing_email: (b.billing_email || '').trim(),
    billing_address: (b.billing_address || '').trim(),
    subscription_plan: plan
  });

  const subscription = store.where('subscriptions', (s) => s.company_id === company.id)[0];
  if (subscription && plan !== subscription.plan_type) {
    store.update('subscriptions', subscription.id, { plan_type: plan, price_per_employee: PLANS[plan].pricePerEmployee });
  }

  res.redirect(`/superadmin/companies/${company.id}?saved=1`);
});

// Support path for "I forgot my password": a company contact emails
// support@beron.is (see forgot-password.ejs), and Beron HQ sets them a new
// easy password here - shown once, same as the initial onboarding password,
// so it can be relayed back. The contact can then change it themselves
// under Stillingar once they're logged in again.
router.post('/companies/:id/admins/:userId/reset-password', (req, res) => {
  const company = store.find('companies', req.params.id);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });
  const user = store.find('users', req.params.userId);
  if (!user || user.company_id !== company.id) {
    return res.status(404).render('error', { message: 'Tengiliður fannst ekki.' });
  }
  const newPassword = (req.body.password || '').trim() || 'beron123';
  store.update('users', user.id, { password_hash: bcrypt.hashSync(newPassword, 10) });
  res.redirect(`/superadmin/companies/${company.id}?reset=1&pwd=${encodeURIComponent(newPassword)}&email=${encodeURIComponent(user.email)}`);
});

// Lets Beron HQ see exactly what a company contact sees, instead of
// guessing from the data alone - useful for support calls ("I don't see
// that button"). Logs in as that company's first tengiliður; the original
// superadmin session is stashed so /stop-impersonating (routes/auth.js) can
// switch back without logging in again.
router.post('/companies/:id/login-as', (req, res) => {
  const company = store.find('companies', req.params.id);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });
  const admin = store.where('users', (u) => u.company_id === company.id && u.role === 'admin')[0];
  if (!admin) {
    return res.redirect(`/superadmin/companies/${company.id}?error=` + encodeURIComponent('Enginn tengiliður til að skrá inn sem.'));
  }

  req.session.impersonatorId = req.session.user.id;
  req.session.impersonatingCompanyId = company.id;
  req.session.user = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    company_id: admin.company_id
  };
  res.redirect('/');
});

router.post('/companies/:id/subscription', (req, res) => {
  const company = store.find('companies', req.params.id);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });
  const subscription = store.where('subscriptions', (s) => s.company_id === company.id)[0];
  if (subscription) {
    store.update('subscriptions', subscription.id, { active: !subscription.active });
  }
  res.redirect('/superadmin/companies/' + company.id);
});

// Permanent delete - not just deactivation. The confirm step happens
// twice client-side (see company-detail.ejs) before this ever gets hit,
// since there's no undo: every login, employee, event, and gift order
// belonging to the company goes with it.
router.post('/companies/:id/delete', (req, res) => {
  const company = store.find('companies', req.params.id);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });

  store.where('users', (u) => u.company_id === company.id).forEach((u) => store.remove('users', u.id));
  store.where('subscriptions', (s) => s.company_id === company.id).forEach((s) => store.remove('subscriptions', s.id));
  store.where('giftOrders', (o) => o.company_id === company.id).forEach((o) => store.remove('giftOrders', o.id));
  store.where('events', (e) => e.company_id === company.id).forEach((e) => store.remove('events', e.id));
  store.where('employees', (e) => e.company_id === company.id).forEach((e) => store.remove('employees', e.id));
  store.remove('companies', company.id);

  res.redirect('/superadmin/companies');
});

// The main operational view for Beron HQ: every gift order across every
// company, always showing a date and countdown so staff know what's urgent.
// Sorted soonest/most-overdue first so the queue reads like a to-do list.
router.get('/orders', (req, res) => {
  store.all('companies').forEach((c) => runDailyWorkflows(c.id));

  const status = req.query.status || 'all';
  const range = req.query.range || 'all';
  const today = new Date();

  let orders = store.all('giftOrders').map((o) => {
    const event = o.event_id ? store.find('events', o.event_id) : null;
    const date = event ? event.date : null;
    const daysAway = date ? daysBetween(today, new Date(date + 'T00:00:00')) : null;
    return Object.assign({}, o, {
      employee: o.employee_id ? store.find('employees', o.employee_id) : null,
      company: store.find('companies', o.company_id),
      date,
      daysAway
    });
  });

  if (status !== 'all') orders = orders.filter((o) => o.status === status);

  if (range === 'today') {
    orders = orders.filter((o) => o.daysAway === 0);
  } else if (range === 'week') {
    orders = orders.filter((o) => o.daysAway !== null && o.daysAway >= 0 && o.daysAway <= 6);
  } else if (range === 'month') {
    orders = orders.filter((o) => {
      if (!o.date) return false;
      const d = new Date(o.date + 'T00:00:00');
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    });
  } else if (range === 'past') {
    orders = orders.filter((o) => o.daysAway !== null && o.daysAway < 0);
  } else {
    // "Allar" means all current/upcoming orders - anything already past its
    // date lives under the separate "Liðið" tab instead, so it doesn't
    // clutter the main queue once it's no longer actionable.
    orders = orders.filter((o) => o.daysAway === null || o.daysAway >= 0);
  }

  orders.sort((a, b) => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    // Most-recently-elapsed first under "Liðið" (freshest follow-up first);
    // soonest-due first everywhere else.
    return range === 'past' ? (a.date < b.date ? 1 : -1) : (a.date > b.date ? 1 : -1);
  });

  res.render('superadmin/orders', { orders, status, range });
});

// The billing worksheet for Beron HQ: for a given month, per company, shows
// exactly two numbers to charge - the pass-through cost of the gifts
// actually delivered/ordered that month (plus any custom-order handling
// fees), and the recurring per-employee subscription amount. This is what
// finance uses at month-end to know exactly what to invoice each company.
// (Shared with the HR-facing billing page - see lib/billing.js.)
function financeForMonth(year, month) {
  return store.all('companies').map((c) => {
    const row = billingForCompanyMonth(c, year, month);
    const payment = getInvoicePayment(c.id, year, month);
    return Object.assign({}, row, { paid: !!(payment && payment.paid), paidAt: payment ? payment.paid_at : null });
  });
}

router.get('/finance', (req, res) => {
  store.all('companies').forEach((c) => runDailyWorkflows(c.id));

  const today = new Date();
  let year = parseInt(req.query.year, 10);
  let month = parseInt(req.query.month, 10); // 1-12 from query, stored 0-11 internally
  if (!year || !month || month < 1 || month > 12) {
    year = today.getFullYear();
    month = today.getMonth() + 1;
  }
  const monthIndex = month - 1;

  const rows = financeForMonth(year, monthIndex);
  const monthLabel = `${MONTHS_IS[monthIndex]} ${year}`;

  let prevMonth = month - 1, prevYear = year;
  if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
  let nextMonth = month + 1, nextYear = year;
  if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }

  const isCurrentMonth = year === today.getFullYear() && monthIndex === today.getMonth();

  res.render('superadmin/finance', {
    rows,
    monthLabel,
    year,
    month,
    prevYear,
    prevMonth,
    nextYear,
    nextMonth,
    isCurrentMonth,
    grandGiftCostTotal: rows.reduce((s, r) => s + r.giftCostTotal, 0),
    grandHandlingTotal: rows.reduce((s, r) => s + r.handlingFeeTotal, 0),
    grandSubTotal: rows.reduce((s, r) => s + r.subscriptionTotal, 0),
    grandTotal: rows.reduce((s, r) => s + r.grandTotal, 0),
    grandOutstandingTotal: rows.filter((r) => !r.paid).reduce((s, r) => s + r.grandTotal, 0)
  });
});

// Merkja reikning greiddan/ógreiddan fyrir eitt fyrirtæki, einn mánuð -
// billing er handvirkt svo þetta er eina staðfestingin á hver hefur borgað.
router.post('/finance/:companyId/toggle-paid', (req, res) => {
  const company = store.find('companies', req.params.companyId);
  if (!company) return res.status(404).render('error', { message: 'Fyrirtæki fannst ekki.' });
  const year = parseInt(req.body.year, 10);
  const month = parseInt(req.body.month, 10); // 1-12 from form
  if (!year || !month) return res.redirect('/superadmin/finance');

  const monthIndex = month - 1;
  const current = getInvoicePayment(company.id, year, monthIndex);
  setInvoicePayment(company.id, year, monthIndex, !(current && current.paid));

  res.redirect(`/superadmin/finance?year=${year}&month=${month}`);
});

router.post('/orders/:id/status', (req, res) => {
  const order = store.find('giftOrders', req.params.id);
  if (!order) return res.status(404).render('error', { message: 'Pöntun fannst ekki.' });
  const allowed = ['pending', 'ordered', 'shipped', 'delivered', 'cancelled'];
  if (allowed.includes(req.body.status)) {
    store.update('giftOrders', order.id, { status: req.body.status });
  }
  res.redirect('/superadmin/orders');
});

// "Bóka fund" leads from the public marketing site, and support messages
// company admins send in from Stillingar - newest first so Beron HQ always
// sees who still needs a follow-up. Support fyrirspurnir carry their full
// back-and-forth thread along so the page can render them like a chat.
router.get('/fyrirspurnir', (req, res) => {
  const status = req.query.status || 'all';
  const type = req.query.type || 'all';
  const q = (req.query.q || '').trim();
  let leads = store.all('meetingRequests').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (status !== 'all') leads = leads.filter((l) => l.status === status);
  if (type !== 'all') leads = leads.filter((l) => (l.type || 'lead') === type);

  leads = leads.map((l) => {
    if (l.type !== 'support') return l;
    const messages = store
      .where('inquiryMessages', (m) => m.meeting_request_id === l.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return Object.assign({}, l, { messages });
  });

  if (q) {
    const needle = q.toLowerCase();
    leads = leads.filter((l) => {
      const haystack = [
        l.name,
        l.company,
        l.email,
        l.message,
        l.type === 'support' ? (l.messages || []).map((m) => m.body).join(' ') : ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  res.render('superadmin/leads', { leads, status, type, q });
});

router.post('/fyrirspurnir/:id/status', (req, res) => {
  const lead = store.find('meetingRequests', req.params.id);
  if (!lead) return res.status(404).render('error', { message: 'Fyrirspurn fannst ekki.' });
  const allowed = ['new', 'contacted', 'closed'];
  if (allowed.includes(req.body.status)) {
    store.update('meetingRequests', lead.id, { status: req.body.status });
  }
  res.redirect(req.get('referer') || '/superadmin/fyrirspurnir');
});

// Beron HQ's reply to a support fyrirspurn - added to the thread and shown
// back to the company contact on their own /fyrirspurnir page. Marks the
// request "contacted" automatically unless it's already closed.
router.post('/fyrirspurnir/:id/reply', (req, res) => {
  const lead = store.find('meetingRequests', req.params.id);
  if (!lead) return res.status(404).render('error', { message: 'Fyrirspurn fannst ekki.' });
  const body = (req.body.reply || '').trim();
  if (!body) return res.redirect(req.get('referer') || '/superadmin/fyrirspurnir');

  store.insert('inquiryMessages', {
    meeting_request_id: lead.id,
    sender: 'beron',
    body
  });
  store.update('meetingRequests', lead.id, {
    status: lead.status === 'closed' ? 'closed' : 'contacted'
  });

  res.redirect(req.get('referer') || '/superadmin/fyrirspurnir');
});

// Gjafasafn: a simple running list of gift ideas Beron HQ has actually
// bought and liked - name, rough price, category, a note on why it worked -
// so a good choice for one company's afmæli can be reused for the next
// instead of starting from scratch every time. Not linked to orders yet,
// just a shared reference list.
router.get('/gjafasafn', (req, res) => {
  const items = store.all('giftCatalog').sort((a, b) => a.name.localeCompare(b.name, 'is'));
  res.render('superadmin/gift-catalog', { items, error: req.query.error, saved: req.query.saved });
});

router.post('/gjafasafn', (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) {
    return res.redirect('/superadmin/gjafasafn?error=' + encodeURIComponent('Nafn er nauðsynlegt.'));
  }
  store.insert('giftCatalog', {
    name,
    price: b.price ? Number(b.price) : null,
    category: (b.category || '').trim(),
    notes: (b.notes || '').trim()
  });
  res.redirect('/superadmin/gjafasafn?saved=1');
});

router.put('/gjafasafn/:id', (req, res) => {
  const item = store.find('giftCatalog', req.params.id);
  if (!item) return res.status(404).render('error', { message: 'Fannst ekki.' });
  const b = req.body;
  store.update('giftCatalog', item.id, {
    name: (b.name || '').trim() || item.name,
    price: b.price ? Number(b.price) : null,
    category: (b.category || '').trim(),
    notes: (b.notes || '').trim()
  });
  res.redirect('/superadmin/gjafasafn?saved=1');
});

router.delete('/gjafasafn/:id', (req, res) => {
  store.remove('giftCatalog', req.params.id);
  res.redirect('/superadmin/gjafasafn?saved=1');
});

module.exports = router;
