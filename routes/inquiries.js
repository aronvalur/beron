const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

// A dedicated place for company contacts to send Beron HQ a message - a
// change needed, something not working, a general question - and go back
// and forth like a chat until it's resolved. Shows up on the superadmin
// side under /superadmin/fyrirspurnir, filed with type "support" so Beron
// HQ can tell these apart from "Bóka fund" leads off the marketing site.
router.get('/', (req, res) => {
  const companyId = req.session.user.company_id;
  const inquiries = store
    .where('meetingRequests', (m) => m.company_id === companyId && m.type === 'support')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((i) => {
      const messages = store
        .where('inquiryMessages', (msg) => msg.meeting_request_id === i.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return Object.assign({}, i, { messages });
    });

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

  const created = store.insert('meetingRequests', {
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

  store.insert('inquiryMessages', {
    meeting_request_id: created.id,
    sender: 'company',
    body: message
  });

  res.redirect('/fyrirspurnir?sent=1');
});

// A follow-up message on an already-open fyrirspurn - keeps it going like a
// chat. Flags the thread "new" again so Beron HQ knows it needs a look,
// even if they'd already replied once. Closed threads can't be replied to.
router.post('/:id/reply', (req, res) => {
  const companyId = req.session.user.company_id;
  const inquiry = store.find('meetingRequests', req.params.id);
  const body = (req.body.message || '').trim();

  if (!inquiry || inquiry.company_id !== companyId || inquiry.type !== 'support') {
    return res.status(404).render('error', { message: 'Fyrirspurn fannst ekki.' });
  }
  if (inquiry.status === 'closed') {
    return res.redirect('/fyrirspurnir?error=' + encodeURIComponent('Þessari fyrirspurn hefur verið lokað.'));
  }
  if (!body) {
    return res.redirect('/fyrirspurnir?error=' + encodeURIComponent('Skrifaðu skilaboð áður en þú sendir.'));
  }

  store.insert('inquiryMessages', {
    meeting_request_id: inquiry.id,
    sender: 'company',
    body
  });
  store.update('meetingRequests', inquiry.id, { status: 'new' });

  res.redirect('/fyrirspurnir?sent=1');
});

// Lets the company contact close out their own fyrirspurn once it's
// resolved, instead of waiting on Beron HQ to do it from their side.
router.post('/:id/close', (req, res) => {
  const companyId = req.session.user.company_id;
  const inquiry = store.find('meetingRequests', req.params.id);

  if (!inquiry || inquiry.company_id !== companyId || inquiry.type !== 'support') {
    return res.status(404).render('error', { message: 'Fyrirspurn fannst ekki.' });
  }

  store.update('meetingRequests', inquiry.id, { status: 'closed' });
  res.redirect('/fyrirspurnir');
});

module.exports = router;
