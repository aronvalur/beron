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
    saved: req.query.saved,
    sent: req.query.sent
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

// Lets the logged-in contact replace whatever password Beron HQ gave them
// (or anyone else) with one of their own choosing. Requires the current
// password so a shared/unlocked computer can't silently lock others out.
router.post('/password', (req, res) => {
  const userId = req.session.user.id;
  const user = store.find('users', userId);
  const currentPassword = req.body.current_password || '';
  const newPassword = req.body.new_password || '';
  const confirmPassword = req.body.confirm_password || '';

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.redirect('/settings?error=' + encodeURIComponent('Núverandi lykilorð er rangt.'));
  }
  if (newPassword.length < 6) {
    return res.redirect('/settings?error=' + encodeURIComponent('Nýja lykilorðið þarf að vera minnst 6 stafir.'));
  }
  if (newPassword !== confirmPassword) {
    return res.redirect('/settings?error=' + encodeURIComponent('Nýju lykilorðin eru ekki eins.'));
  }

  store.update('users', userId, { password_hash: bcrypt.hashSync(newPassword, 10) });
  res.redirect('/settings?saved=1');
});

// Lets a company contact send a message straight to Beron HQ - shows up on
// /superadmin/fyrirspurnir alongside the "Bóka fund" leads, filed under its
// own type so Beron HQ can tell the two apart.
router.post('/support', (req, res) => {
  const companyId = req.session.user.company_id;
  const company = store.find('companies', companyId);
  const message = (req.body.message || '').trim();

  if (!message) {
    return res.redirect('/settings?error=' + encodeURIComponent('Skrifaðu skilaboð áður en þú sendir.'));
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

  res.redirect('/settings?sent=1');
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
