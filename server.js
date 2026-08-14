require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');

const { seedIfEmpty } = require('./db/seed');
const store = require('./db/store');
const { formatDate, formatDayMonth, greeting } = require('./lib/format');
const { statusLabel, eventTypeLabel, deliveryPreferenceLabel, roleLabel, leadStatusLabel } = require('./lib/labels');

seedIfEmpty();

const marketingRoutes = require('./routes/marketing');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const birthdayRoutes = require('./routes/birthdays');
const employeeRoutes = require('./routes/employees');
const giftOrderRoutes = require('./routes/giftOrders');
const billingRoutes = require('./routes/billing');
const inquiryRoutes = require('./routes/inquiries');
const settingsRoutes = require('./routes/settings');
const announcementRoutes = require('./routes/announcements');
const superadminRoutes = require('./routes/superadmin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Available in every view without routes needing to pass them explicitly
app.locals.formatDate = formatDate;
app.locals.formatDayMonth = formatDayMonth;
app.locals.greeting = greeting;
app.locals.statusLabel = statusLabel;
app.locals.eventTypeLabel = eventTypeLabel;
app.locals.deliveryPreferenceLabel = deliveryPreferenceLabel;
app.locals.roleLabel = roleLabel;
app.locals.leadStatusLabel = leadStatusLabel;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'beron-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
  })
);

// Make current user available to every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.currentCompanyName = null;
  res.locals.isImpersonating = !!req.session.impersonatorId;
  if (req.session.user && req.session.user.role === 'admin' && req.session.user.company_id) {
    const company = store.find('companies', req.session.user.company_id);
    res.locals.currentCompanyName = company ? company.name : null;
  }
  next();
});

app.use('/', authRoutes);
app.use('/', marketingRoutes);
app.use('/', dashboardRoutes);
app.use('/birthdays', birthdayRoutes);
app.use('/employees', employeeRoutes);
// Tilefni is now folded into Gjafapantanir - keep the old URL working.
app.get('/events', (req, res) => res.redirect('/gift-orders'));
app.use('/gift-orders', giftOrderRoutes);
app.use('/billing', billingRoutes);
app.use('/fyrirspurnir', inquiryRoutes);
app.use('/settings', settingsRoutes);
app.use('/tilkynningar', announcementRoutes);
app.use('/superadmin', superadminRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Síðan fannst ekki.' });
});

app.listen(PORT, () => {
  console.log(`Beron keyrir á http://localhost:${PORT}`);
  console.log('Innskráningar til að prófa:');
  console.log('  Tengiliður fyrirtækis: sigrun@nordictech.is / beron123');
  console.log('  Starfsmaður Beron:     admin@beron.is / beron123');
});
