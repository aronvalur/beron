// Core scheduling workflows: birthday detection, Christmas event generation,
// and gift-order linking. In V1 these run "just in time" (on dashboard load /
// login) rather than via a real cron daemon, but the logic is the same logic
// a daily scheduled job would run.

const store = require('../db/store');

const WINDOW_DAYS = 30; // "upcoming" window for birthdays
const NOTE_CUTOFF_DAYS = 5; // HR can add/edit a note until this many days before the event
const CANCEL_CUTOFF_DAYS = 7; // HR can cancel a sérpöntun until this many days before delivery

function toDateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a, b) {
  return Math.round((toDateOnly(b) - toDateOnly(a)) / 86400000);
}

// employee.birthday is stored as 'YYYY-MM-DD' (year may be arbitrary birth year).
// Returns the next occurrence of that month/day on or after `today`.
function nextOccurrence(birthdayStr, today) {
  const parts = birthdayStr.split('-').map(Number);
  const m = parts[1];
  const d = parts[2];
  const y = today.getFullYear();
  let candidate = new Date(y, m - 1, d);
  if (toDateOnly(candidate) < toDateOnly(today)) {
    candidate = new Date(y + 1, m - 1, d);
  }
  return candidate;
}

function ensureBirthdayEvents(companyId, today = new Date()) {
  const employees = store.where('employees', (e) => e.company_id === companyId && e.active);
  const created = [];
  employees.forEach((emp) => {
    if (!emp.birthday) return;
    const next = nextOccurrence(emp.birthday, today);
    // Ensure the event (and its linked gift order, via ensureGiftOrdersForEvents)
    // for every active employee's next birthday exists right away, same as
    // Christmas already does - not just once it's within WINDOW_DAYS. That
    // window is only used for "what's coming up soon" display lists (the
    // dashboard, upcomingEventsForCompany); it shouldn't gate whether the
    // record exists at all, or birthdays more than a month out silently
    // never show up on Öll tilefni.
    const dateStr = fmt(next);
    const exists = store.where(
      'events',
      (ev) => ev.employee_id === emp.id && ev.event_type === 'birthday' && ev.date === dateStr
    );
    if (exists.length === 0) {
      created.push(
        store.insert('events', {
          company_id: companyId,
          employee_id: emp.id,
          event_type: 'birthday',
          date: dateStr,
          status: 'upcoming'
        })
      );
    }
  });
  return created;
}

function ensureChristmasEvents(companyId, today = new Date()) {
  const subs = store.where('subscriptions', (s) => s.company_id === companyId && s.active);
  const sub = subs[0];
  if (!sub || sub.plan_type !== 'birthdays_christmas') return [];

  let year = today.getFullYear();
  let christmas = new Date(year, 11, 24); // Dec 24 - Icelandic Christmas Eve
  if (toDateOnly(christmas) < toDateOnly(today)) {
    year += 1;
    christmas = new Date(year, 11, 24);
  }
  const dateStr = fmt(christmas);
  const employees = store.where('employees', (e) => e.company_id === companyId && e.active);
  const created = [];
  employees.forEach((emp) => {
    const exists = store.where(
      'events',
      (ev) => ev.employee_id === emp.id && ev.event_type === 'christmas' && ev.date === dateStr
    );
    if (exists.length === 0) {
      created.push(
        store.insert('events', {
          company_id: companyId,
          employee_id: emp.id,
          event_type: 'christmas',
          date: dateStr,
          status: 'upcoming'
        })
      );
    }
  });
  return created;
}

// Beron handles gift ordering automatically for birthdays and Christmas -
// HR never has to click anything. As soon as an event is "upcoming", we
// create the linked gift order behind the scenes, using the budget and
// delivery preference already on file for that employee. HR only creates
// gift orders manually for one-off special occasions (new hires, promotions,
// life events, etc.) via the custom gift order form.
function ensureGiftOrdersForEvents(companyId) {
  const events = store.where(
    'events',
    (e) => e.company_id === companyId && e.status === 'upcoming' && (e.event_type === 'birthday' || e.event_type === 'christmas')
  );
  const existingOrderEventIds = new Set(
    store.where('giftOrders', (o) => o.company_id === companyId && o.event_id).map((o) => o.event_id)
  );
  const created = [];
  events.forEach((ev) => {
    if (existingOrderEventIds.has(ev.id)) return;
    const employee = store.find('employees', ev.employee_id);
    created.push(
      store.insert('giftOrders', {
        company_id: companyId,
        employee_id: ev.employee_id,
        event_id: ev.id,
        gift_type: ev.event_type,
        budget_amount: employee && employee.birthday_budget ? employee.birthday_budget : null,
        status: 'pending',
        fulfillment_method: 'manual',
        delivery_method: employee ? employee.delivery_preference : null,
        notes: ''
      })
    );
  });
  return created;
}

// Same month/day as `birthdayStr`, but placed in a specific calendar year
// (may be in the past or future relative to today - used for "this month"
// style calendar views rather than forward-looking countdowns).
function occurrenceInYear(birthdayStr, year) {
  const parts = birthdayStr.split('-').map(Number);
  return new Date(year, parts[1] - 1, parts[2]);
}

function runDailyWorkflows(companyId) {
  ensureBirthdayEvents(companyId);
  ensureChristmasEvents(companyId);
  ensureGiftOrdersForEvents(companyId);
}

function upcomingEventsForCompany(companyId, withinDays = 30, today = new Date()) {
  const events = store.where('events', (e) => e.company_id === companyId && e.status === 'upcoming');
  return events
    .filter((e) => {
      const d = new Date(e.date + 'T00:00:00');
      const diff = daysBetween(today, d);
      return diff >= -1 && diff <= withinDays;
    })
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

module.exports = {
  WINDOW_DAYS,
  NOTE_CUTOFF_DAYS,
  CANCEL_CUTOFF_DAYS,
  fmt,
  daysBetween,
  nextOccurrence,
  occurrenceInYear,
  ensureBirthdayEvents,
  ensureChristmasEvents,
  ensureGiftOrdersForEvents,
  runDailyWorkflows,
  upcomingEventsForCompany
};
