const express = require('express');
const store = require('../db/store');

const router = express.Router();

// The public marketing homepage. Logged-in users skip straight past this to
// their dashboard / Beron HQ view - the marketing site is only for visitors
// who haven't signed in yet.
router.get('/', (req, res, next) => {
  if (req.session.user) return next();
  res.render('marketing/home', {
    sent: req.query.sent === '1',
    formError: null,
    formValues: {}
  });
});

// "Bóka fund" lead capture. No pricing is shown on the site - every visitor
// is routed through this form, which stores the request for Beron HQ to
// follow up on (see /superadmin/fyrirspurnir).
router.post('/boka-fund', (req, res) => {
  if (req.session.user) return res.redirect('/');

  const b = req.body;
  const name = (b.name || '').trim();
  const company = (b.company || '').trim();
  const email = (b.email || '').trim();
  const phone = (b.phone || '').trim();
  const employeeRange = b.employee_range || '';
  const message = (b.message || '').trim();

  if (!name || !company || !email || !phone) {
    return res.status(400).render('marketing/home', {
      sent: false,
      formError: 'Vantar upplýsingar - nafn, fyrirtæki, netfang og símanúmer þurfa öll að fylgja.',
      formValues: { name, company, email, phone, employee_range: employeeRange, message }
    });
  }

  store.insert('meetingRequests', {
    name,
    company,
    email,
    phone,
    employee_range: employeeRange,
    message,
    status: 'new'
  });

  res.redirect('/?sent=1#boka-fund');
});

module.exports = router;
