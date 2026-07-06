function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireCompanyAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'Þetta svæði er eingöngu fyrir tengiliði fyrirtækja.' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'superadmin') {
    return res.status(403).render('error', { message: 'Þetta svæði er eingöngu fyrir starfsfólk Beron.' });
  }
  next();
}

module.exports = { requireLogin, requireCompanyAdmin, requireSuperAdmin };
