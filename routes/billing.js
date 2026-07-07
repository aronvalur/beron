const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');
const { PLANS, SETUP_FEE, computeInvoice } = require('../lib/pricing');
const { billingForCompanyMonth } = require('../lib/billing');
const { MONTHS_IS } = require('../lib/format');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const company = store.find('companies', companyId);
  const subscription = store.where('subscriptions', (s) => s.company_id === companyId)[0];
  const activeEmployeeCount = store.where('employees', (e) => e.company_id === companyId && e.active).length;
  const invoice = computeInvoice(company.subscription_plan, activeEmployeeCount);

  const today = new Date();
  const monthBilling = billingForCompanyMonth(company, today.getFullYear(), today.getMonth());
  const monthLabel = `${MONTHS_IS[today.getMonth()]} ${today.getFullYear()}`;

  res.render('billing', { company, subscription, invoice, monthBilling, monthLabel, PLANS, SETUP_FEE, saved: req.query.saved });
});

router.post('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const b = req.body;

  store.update('companies', companyId, {
    kennitala: b.kennitala || '',
    billing_email: b.billing_email || '',
    billing_address: b.billing_address || '',
    subscription_plan: b.subscription_plan
  });

  const subscription = store.where('subscriptions', (s) => s.company_id === companyId)[0];
  const plan = PLANS[b.subscription_plan] || PLANS.birthdays;
  if (subscription) {
    store.update('subscriptions', subscription.id, {
      plan_type: b.subscription_plan,
      price_per_employee: plan.pricePerEmployee
    });
  } else {
    store.insert('subscriptions', {
      company_id: companyId,
      plan_type: b.subscription_plan,
      pricing_model: 'per_employee',
      price_per_employee: plan.pricePerEmployee,
      monthly_fee: null,
      active: true
    });
  }

  res.redirect('/billing?saved=1');
});

module.exports = router;
