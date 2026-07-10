const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

// A dedicated place for company contacts to send Beron HQ a message - a
// change needed, something not working, a general question - and see the
// status of what they've already sent in. Shows up on the superadmin side
// under /superadmin/fyrirspurnir, filed with type "support" so Beron HQ can
// tell these apart from "Bóka fund" leads off the marketing site.
router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const inquiries = store
    .where('meetingRequests', (m) => m.company_id === companyId && m.type === 'support')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.render('inquiries', {
    inquiries,
    error: req.query.error,
    sent: req.query.sent
  });
});

router.post('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const company = store.find('companies', companyId);
  const message = (req.body.message || '').trim();

  if (!message) {
    return res.redirect('/fyrirspurnir?error=' + encodeURIComponent('Skrifaðu skilaboð áður en þú sendir.'));
  }

  store.insert('meetingRequests', {
    type: 'support',
    name: req.session.user.name,
    company: company.name,
    email: req.session.user.email,
    phone: '',
    employee_range: '',
    message,
    status: 'new',
    company_id: companyId
  });

  res.redirect('/fyrirspurnir?sent=1');
});

module.exports = router;
