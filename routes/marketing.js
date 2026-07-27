const crypto = require('crypto');
const express = require('express');
const store = require('../db/store');

const router = express.Router();

// --- CSRF token (lightweight, no extra dependency) --------------------
// Generated once per session and re-checked on every /boka-fund POST.
function getCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

// --- Very small in-memory rate limiter for the public lead form --------
// Keyed by IP: max 5 submissions per hour. Resets on server restart, which
// is fine for an MVP - the goal is just to blunt basic bot/script abuse,
// not to be a hardened WAF.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const submissionsByIp = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (submissionsByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  submissionsByIp.set(ip, timestamps);
  return timestamps.length >= RATE_LIMIT_MAX;
}

function recordSubmission(ip) {
  const now = Date.now();
  const timestamps = submissionsByIp.get(ip) || [];
  timestamps.push(now);
  submissionsByIp.set(ip, timestamps);
}

// The public marketing homepage. Logged-in users skip straight past this to
// their dashboard / Beron HQ view - the marketing site is only for visitors
// who haven't signed in yet.
router.get('/', (req, res, next) => {
  if (req.session.user) return next();
  res.render('marketing/home', {
    sent: req.query.sent === '1',
    formError: null,
    formValues: {},
    csrfToken: getCsrfToken(req)
  });
});

// Minimal privacy policy - linked from the bóka fund form's consent
// checkbox and from the footer.
router.get('/personuvernd', (req, res) => {
  res.render('marketing/personuvernd');
});

// "Bóka fund" lead capture. No pricing is shown on the site - every visitor
// is routed through this form, which stores the request for Beron HQ to
// follow up on (see /superadmin/fyrirspurnir).
router.post('/boka-fund', (req, res) => {
  if (req.session.user) return res.redirect('/');

  const b = req.body;

  // Honeypot: a hidden field real visitors never see or fill in. Bots that
  // blindly fill every input trip this - we pretend to succeed so we don't
  // tip them off, but never store anything.
  if ((b.website || '').trim() !== '') {
    return res.redirect('/?sent=1#boka-fund');
  }

  // CSRF check.
  if (!req.session.csrfToken || b.csrf_token !== req.session.csrfToken) {
    return res.status(400).render('marketing/home', {
      sent: false,
      formError: 'Fyrirspurnin rann út - reyndu aftur.',
      formValues: {},
      csrfToken: getCsrfToken(req)
    });
  }

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).render('marketing/home', {
      sent: false,
      formError: 'Of margar fyrirspurnir í röð frá þessari tengingu - reyndu aftur síðar eða sendu okkur línu á support@beron.is.',
      formValues: {},
      csrfToken: getCsrfToken(req)
    });
  }

  const name = (b.name || '').trim();
  const company = (b.company || '').trim();
  const email = (b.email || '').trim();
  const phone = (b.phone || '').trim();
  const employeeRange = b.employee_range || '';
  const message = (b.message || '').trim();
  const consent = b.consent === 'on';

  const formValues = { name, company, email, phone, employee_range: employeeRange, message };

  if (!name || !company || !email || !phone) {
    return res.status(400).render('marketing/home', {
      sent: false,
      formError: 'Vantar upplýsingar - nafn, fyrirtæki, netfang og símanúmer þurfa öll að fylgja.',
      formValues,
      csrfToken: getCsrfToken(req)
    });
  }

  if (!consent) {
    return res.status(400).render('marketing/home', {
      sent: false,
      formError: 'Þú þarft að samþykkja að Beron hafi samband við þig til að við getum sent inn fyrirspurnina.',
      formValues,
      csrfToken: getCsrfToken(req)
    });
  }

  recordSubmission(ip);

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
