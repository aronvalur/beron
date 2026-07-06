// Seeds demo data on first run so the app is immediately explorable.
// Safe to call repeatedly - it only seeds when the store is empty.

const bcrypt = require('bcryptjs');
const store = require('./store');

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = 1990; // arbitrary birth year, only month/day matter for scheduling
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seedIfEmpty() {
  if (store.all('companies').length > 0) return false;

  const hash = bcrypt.hashSync('beron123', 10);

  // --- Beron super admin (internal, not tied to a company) ---
  store.insert('users', {
    name: 'Beron Admin',
    email: 'admin@beron.is',
    password_hash: hash,
    role: 'superadmin',
    company_id: null
  });

  // --- Company 1: Nordic Tech ehf. (Birthdays + Christmas plan) ---
  const nordic = store.insert('companies', {
    name: 'Nordic Tech ehf.',
    kennitala: '540169-2110',
    subscription_plan: 'birthdays_christmas',
    billing_email: 'finance@nordictech.is',
    billing_address: 'Skeifan 11, 108 Reykjavík',
    active_admin_count: 1,
    email_notifications: true
  });

  store.insert('users', {
    name: 'Sigrún Jónsdóttir',
    email: 'sigrun@nordictech.is',
    password_hash: hash,
    role: 'admin',
    company_id: nordic.id
  });

  store.insert('subscriptions', {
    company_id: nordic.id,
    plan_type: 'birthdays_christmas',
    pricing_model: 'per_employee',
    price_per_employee: 1490,
    monthly_fee: null,
    active: true
  });

  const nordicEmployees = [
    { name: 'Anna Kristín Ólafsdóttir', department: 'Marketing', days: 5, budget: 12000, delivery_preference: 'to_employee', shirt_size: 'M', preferences: 'Coffee, hiking' },
    { name: 'Björn Þór Sigurðsson', department: 'Engineering', days: 12, budget: 10000, delivery_preference: 'to_hr_office', shirt_size: 'L', preferences: 'Craft beer, board games' },
    { name: 'Guðrún Elva Magnúsdóttir', department: 'Sales', days: 25, budget: 10000, delivery_preference: 'to_employee', shirt_size: 'S', preferences: 'Tea, reading' },
    { name: 'Jón Páll Einarsson', department: 'Engineering', days: 45, budget: 10000, delivery_preference: 'to_employee', shirt_size: 'XL', preferences: 'Cycling' },
    { name: 'Katrín Ósk Gunnarsdóttir', department: 'Finance', days: 2, budget: 15000, delivery_preference: 'to_hr_office', shirt_size: 'M', preferences: 'Chocolate, yoga' },
    { name: 'Ólafur Ragnar Björnsson', department: 'Operations', days: -1, budget: 10000, delivery_preference: 'to_employee', shirt_size: 'L', preferences: 'Fishing' },
    { name: 'Sara Lind Hilmarsdóttir', department: 'HR', days: 18, budget: 10000, delivery_preference: 'to_employee', shirt_size: 'S', preferences: 'Skincare, wine', active: false },
    { name: 'Þór Magnússon', department: 'Marketing', days: 60, budget: 8000, delivery_preference: 'to_hr_office', shirt_size: 'M', preferences: 'Golf' }
  ];

  nordicEmployees.forEach((e) => {
    store.insert('employees', {
      company_id: nordic.id,
      name: e.name,
      birthday: offsetDate(e.days),
      department: e.department,
      birthday_budget: e.budget,
      address: '',
      delivery_preference: e.delivery_preference,
      shirt_size: e.shirt_size,
      preferences: e.preferences,
      notes: '',
      active: e.active !== undefined ? e.active : true
    });
  });

  // --- Company 2: Fjord Retail ehf. (Birthdays only plan) ---
  const fjord = store.insert('companies', {
    name: 'Fjord Retail ehf.',
    kennitala: '681298-4409',
    subscription_plan: 'birthdays',
    billing_email: 'accounts@fjordretail.is',
    billing_address: 'Laugavegur 55, 101 Reykjavík',
    active_admin_count: 1,
    email_notifications: false
  });

  store.insert('users', {
    name: 'Magnús Helgi Þórarinsson',
    email: 'magnus@fjordretail.is',
    password_hash: hash,
    role: 'admin',
    company_id: fjord.id
  });

  store.insert('subscriptions', {
    company_id: fjord.id,
    plan_type: 'birthdays',
    pricing_model: 'per_employee',
    price_per_employee: 990,
    monthly_fee: null,
    active: true
  });

  const fjordEmployees = [
    { name: 'Elín Rós Guðjónsdóttir', department: 'Retail', days: 8, budget: 9000, delivery_preference: 'to_employee', shirt_size: 'M', preferences: 'Baking' },
    { name: 'Kristján Ingi Þorsteinsson', department: 'Warehouse', days: 20, budget: 9000, delivery_preference: 'to_hr_office', shirt_size: 'XL', preferences: 'Football' },
    { name: 'Halla Sif Jóhannsdóttir', department: 'Retail', days: 3, budget: 9000, delivery_preference: 'to_employee', shirt_size: 'S', preferences: 'Photography' }
  ];

  fjordEmployees.forEach((e) => {
    store.insert('employees', {
      company_id: fjord.id,
      name: e.name,
      birthday: offsetDate(e.days),
      department: e.department,
      birthday_budget: e.budget,
      address: '',
      delivery_preference: e.delivery_preference,
      shirt_size: e.shirt_size,
      preferences: e.preferences,
      notes: '',
      active: true
    });
  });

  return true;
}

if (require.main === module) {
  const seeded = seedIfEmpty();
  console.log(seeded ? 'Seed data created.' : 'Data already exists - no changes made.');
}

module.exports = { seedIfEmpty };
