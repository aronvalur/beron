const express = require('express');
const store = require('../db/store');
const { requireLogin, requireCompanyAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireCompanyAdmin);

function scoped(req) {
  return store.where('employees', (e) => e.company_id === req.session.user.company_id);
}

router.get('/', (req, res) => {
  const employees = scoped(req).sort((a, b) => a.name.localeCompare(b.name));
  const company = store.find('companies', req.session.user.company_id);
  res.render('employees/index', { employees, company });
});

router.get('/new', (req, res) => {
  const company = store.find('companies', req.session.user.company_id);
  res.render('employees/form', { employee: null, company });
});

router.post('/', (req, res) => {
  const b = req.body;
  store.insert('employees', {
    company_id: req.session.user.company_id,
    name: b.name,
    birthday: b.birthday,
    department: b.department || '',
    birthday_budget: b.birthday_budget ? Number(b.birthday_budget) : null,
    address: b.address || '',
    delivery_preference: b.delivery_preference || 'to_employee',
    shirt_size: b.shirt_size || '',
    preferences: b.preferences || '',
    notes: b.notes || '',
    active: true
  });
  res.redirect('/employees');
});

router.get('/:id/edit', (req, res) => {
  const employee = store.find('employees', req.params.id);
  if (!employee || employee.company_id !== req.session.user.company_id) {
    return res.status(404).render('error', { message: 'Starfsmaður fannst ekki.' });
  }
  const company = store.find('companies', req.session.user.company_id);
  res.render('employees/form', { employee, company });
});

router.put('/:id', (req, res) => {
  const employee = store.find('employees', req.params.id);
  if (!employee || employee.company_id !== req.session.user.company_id) {
    return res.status(404).render('error', { message: 'Starfsmaður fannst ekki.' });
  }
  const b = req.body;
  store.update('employees', employee.id, {
    name: b.name,
    birthday: b.birthday,
    department: b.department || '',
    birthday_budget: b.birthday_budget ? Number(b.birthday_budget) : null,
    address: b.address || '',
    delivery_preference: b.delivery_preference || 'to_employee',
    shirt_size: b.shirt_size || '',
    preferences: b.preferences || '',
    notes: b.notes || ''
  });
  res.redirect('/employees');
});

router.post('/:id/toggle-active', (req, res) => {
  const employee = store.find('employees', req.params.id);
  if (employee && employee.company_id === req.session.user.company_id) {
    store.update('employees', employee.id, { active: !employee.active });
  }
  res.redirect('/employees');
});

router.delete('/:id', (req, res) => {
  const employee = store.find('employees', req.params.id);
  if (employee && employee.company_id === req.session.user.company_id) {
    store.remove('employees', employee.id);
  }
  res.redirect('/employees');
});

module.exports = router;
