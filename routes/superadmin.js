const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { requireLogin, requireSuperAdmin } = require('../middleware/auth');
const { runDailyWorkflows, upcomingEventsForCompany, daysBetween } = require('../lib/events');
const { computeInvoice, PLANS } = require('../lib/pricing');
const { MONTHS_IS } = require('../lib/format');
const { billingForCompanyMonth } = require('../lib/billing');

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

  res.render('superadmin/index', {
    companyCount: stats.length,
    totalActiveEmployees: stats.reduce((sum, s) => sum + s.activeEmployeeCount, 0),
    pendingOrderCount: allPendingOrders.length,
    upcomingEventCount: allUpcoming.length,
    stats
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
  const password = (b.password || '').trim() || 'beron123';

  if (!name || !contactName || !contactEmail) {
    return res.status(400).render('superadmin/company-new', {
      PLANS,
      error: 'Nafn fyrirtækis, nafn tengiliðar og netfang tengiliðar eru nauðsynleg.',
      formValues: { name, kennitala, billing_email: billingEmail, billing_address: billingAddress, subscription_plan: plan, contact_name: contactName, contact_email: contactEmail }
    });
  }

  const emailTaken = store.where('users', (u) => u.email.toLowerCase() === contactEmail.toLowerCase());
  if (emailTaken.length > 0) {
    return res.status(400).render('superadmin/company-new', {
      PLANS,
      error: 'Þetta netfang er þegar í notkun.',
      formValues: { name, kennitala, billing_email: billingEmail, billing_address: billingAddress, subscription_plan: plan, contact_name: contactName, contact_email: contactEmail }
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
    justCreated: req.query.created === '1',
    newPassword: req.query.pwd || null
  });
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
  }

  orders.sort((a, b) => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date > b.date ? 1 : -1;
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
  return store.all('companies').map((c) => billingForCompanyMonth(c, year, month));
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
    grandTotal: rows.reduce((s, r) => s + r.grandTotal, 0)
  });
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

// "Bóka fund" leads submitted from the public marketing site - newest first
// so Beron HQ always sees who still needs a follow-up call.
router.get('/fyrirspurnir', (req, res) => {
  const status = req.query.status || 'all';
  let leads = store.all('meetingRequests').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (status !== 'all') leads = leads.filter((l) => l.status === status);
  res.render('superadmin/leads', { leads, status });
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

module.exports = router;
