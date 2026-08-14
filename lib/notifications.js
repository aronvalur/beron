// Two related jobs live here:
//  1. Emailing a company's HR contact(s) a courtesy heads-up when a
//     birthday/jól is coming up soon (purely informational - Beron already
//     handles ordering the gift automatically, see lib/events.js).
//  2. Feeding the notification bell shown to HR (dashboard) and Beron HQ:
//     the same upcoming-event heads-ups, plus any announcement Beron HQ has
//     posted for that company (or for everyone) that hasn't been dismissed.
//
// Like the rest of the scheduling logic in lib/events.js, this runs "just in
// time" on page load rather than via a real cron daemon - see the note at
// the top of that file.

const store = require('../db/store');
const { sendMail } = require('./mailer');
const { daysBetween } = require('./events');
const { eventTypeLabel } = require('./labels');

// How many days before a birthday/jól to email HR a reminder. Deliberately
// short - this isn't asking HR to do anything, just letting them know
// something's about to happen so nothing feels like a surprise.
const REMINDER_DAYS = 3;

function upcomingReminderEvents(companyId, today = new Date()) {
  const events = store.where(
    'events',
    (e) =>
      e.company_id === companyId &&
      e.status === 'upcoming' &&
      (e.event_type === 'birthday' || e.event_type === 'christmas')
  );
  return events
    .map((e) => {
      const daysAway = daysBetween(today, new Date(e.date + 'T00:00:00'));
      const emp = e.employee_id ? store.find('employees', e.employee_id) : null;
      return Object.assign({}, e, { daysAway, employee: emp });
    })
    .filter((e) => e.daysAway >= 0 && e.daysAway <= REMINDER_DAYS)
    .sort((a, b) => a.daysAway - b.daysAway);
}

// Emails every admin contact at the company once per event, the first time
// that event falls inside the reminder window - guarded by reminder_sent so
// reloading the dashboard ten times doesn't send ten emails.
async function sendBirthdayReminders(companyId, today = new Date()) {
  const company = store.find('companies', companyId);
  if (!company || !company.email_notifications) return [];

  const due = upcomingReminderEvents(companyId, today).filter((e) => !e.reminder_sent);
  if (due.length === 0) return [];

  const admins = store.where('users', (u) => u.company_id === companyId && u.role === 'admin');
  const recipients = admins.map((a) => a.email).filter(Boolean);

  const sent = [];
  for (const ev of due) {
    const who = ev.employee ? ev.employee.name : 'starfsmaður';
    const occasion = eventTypeLabel(ev.event_type).toLowerCase();
    const whenText = ev.daysAway === 0 ? 'í dag' : ev.daysAway === 1 ? 'á morgun' : `eftir ${ev.daysAway} daga`;

    const subject = `${eventTypeLabel(ev.event_type)} hjá ${who} ${whenText} - Beron`;
    const text =
      `Halló!\n\n${occasion} hjá ${who} er ${whenText} (${ev.date}).\n\n` +
      `Þetta er bara ábending - Beron sér um allt sjálfkrafa, gjöfin er þegar á dagskrá og ` +
      `engin þörf á að gera neitt.\n\nKveðja,\nBeron`;

    // eslint-disable-next-line no-await-in-loop
    await sendMail({ to: recipients, subject, text });
    store.update('events', ev.id, { reminder_sent: true });
    sent.push(ev.id);
  }
  return sent;
}

function undismissedAnnouncements(companyId) {
  const all = store
    .where('announcements', (a) => a.company_id === null || a.company_id === companyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const dismissedIds = new Set(
    store.where('announcementDismissals', (d) => d.company_id === companyId).map((d) => d.announcement_id)
  );
  return all.filter((a) => !dismissedIds.has(a.id));
}

// Everything the bell needs to render for one company: nearby occasions +
// undismissed announcements from Beron HQ, plus a combined count for the
// badge.
function getCompanyNotifications(companyId, today = new Date()) {
  const events = upcomingReminderEvents(companyId, today);
  const announcements = undismissedAnnouncements(companyId);
  return {
    events,
    announcements,
    count: events.length + announcements.length
  };
}

module.exports = {
  REMINDER_DAYS,
  upcomingReminderEvents,
  sendBirthdayReminders,
  undismissedAnnouncements,
  getCompanyNotifications
};
