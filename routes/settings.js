const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

const MAX_ADMINS = 5;

router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const company = store.find('companies', companyId);
  const admins = store.where('users', (u) => u.company_id === companyId && u.role === 'admin');
  res.render('settings', {
    company,
    admins,
    maxAdmins: MAX_ADMINS,
    error: req.query.error,
    saved: req.query.saved
  });
});

router.post('/company', (req, res) => {
  const companyId = req.session.user.company_id;
  store.update('companies', companyId, { name: req.body.name });
  res.redirect('/settings?saved=1');
});

router.post('/notifications', (req, res) => {
  const companyId = req.session.user.company_id;
  store.update('companies', companyId, { email_notifications: req.body.email_notifications === 'on' });
  res.redirect('/settings?saved=1');
});

router.post('/admins', (req, res) => {
  const companyId = req.session.user.company_id;
  const existing = store.where('users', (u) => u.company_id === companyId && u.role === 'admin');

  if (existing.length >= MAX_ADMINS) {
    return res.redirect('/settings?error=' + encodeURIComponent(`Hámarksfjölda tengiliða (${MAX_ADMINS}) er náð.`));
  }
  const emailTaken = store.where('users', (u) => u.email.toLowerCase() === String(req.body.email || '').toLowerCase());
  if (emailTaken.length > 0) {
    return res.redirect('/settings?error=' + encodeURIComponent('Þetta netfang er þegar í notkun.'));
  }

  const hash = bcrypt.hashSync(req.body.password || 'beron123', 10);
  store.insert('users', {
    name: req.body.name,
    email: req.body.email,
    password_hash: hash,
    role: 'admin',
    company_id: companyId
  });
  store.update('companies', companyId, { active_admin_count: existing.length + 1 });

  res.redirect('/settings?saved=1');
});

router.post('/admins/:id/remove', (req, res) => {
  const companyId = req.session.user.company_id;
  const target = store.find('users', req.params.id);
  if (!target || target.company_id !== companyId) {
    return res.status(404).render('error', { message: 'Tengiliður fannst ekki.' });
  }
  const remaining = store.where('users', (u) => u.company_id === companyId && u.role === 'admin');
  if (remaining.length <= 1) {
    return res.redirect('/settings?error=' + encodeURIComponent('Fyrirtæki þarf að halda að minnsta kosti einum tengilið.'));
  }
  store.remove('users', target.id);
  store.update('companies', companyId, { active_admin_count: remaining.length - 1 });
  res.redirect('/settings?saved=1');
});

module.exports = router;
