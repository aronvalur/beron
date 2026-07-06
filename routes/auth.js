const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db/store');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = store.where('users', (u) => u.email.toLowerCase() === String(email || '').toLowerCase())[0];

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.render('login', { error: 'Rangt netfang eða lykilorð.' });
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    company_id: user.company_id
  };

  if (user.role === 'superadmin') return res.redirect('/superadmin');
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

module.exports = router;
