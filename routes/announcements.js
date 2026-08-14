const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

// Dismisses one announcement from Beron HQ (broadcast or targeted at this
// company specifically) for this company only - other companies still see
// it until they dismiss it themselves too.
router.post('/:id/dismiss', (req, res) => {
  const companyId = req.session.user.company_id;
  const announcement = store.find('announcements', req.params.id);
  if (!announcement || (announcement.company_id !== null && announcement.company_id !== companyId)) {
    return res.status(404).render('error', { message: 'Tilkynning fannst ekki.' });
  }

  const already = store.where(
    'announcementDismissals',
    (d) => d.announcement_id === announcement.id && d.company_id === companyId
  );
  if (already.length === 0) {
    store.insert('announcementDismissals', { announcement_id: announcement.id, company_id: companyId });
  }

  res.redirect(req.get('referer') || '/');
});

module.exports = router;
