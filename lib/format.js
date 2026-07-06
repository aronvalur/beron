// Shared Icelandic date formatting, e.g. "7. júlí 2026".
// Registered as app.locals in server.js so every EJS view can call
// formatDate(...) / formatDayMonth(...) directly without routes passing it.

const MONTHS_IS = [
  'janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní',
  'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'
];

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    // Handles both 'YYYY-MM-DD' and full ISO timestamps
    return value.length <= 10 ? new Date(value + 'T00:00:00') : new Date(value);
  }
  return new Date(value);
}

// "7. júlí 2026" - for real, meaningful dates (events, orders, invoices).
function formatDate(value) {
  if (!value) return '—';
  const d = toDate(value);
  return `${d.getDate()}. ${MONTHS_IS[d.getMonth()]} ${d.getFullYear()}`;
}

// "7. júlí" - for employee birthdays, where the stored year is just a
// placeholder and showing it would be misleading.
function formatDayMonth(value) {
  if (!value) return '—';
  const d = toDate(value);
  return `${d.getDate()}. ${MONTHS_IS[d.getMonth()]}`;
}

module.exports = { formatDate, formatDayMonth, MONTHS_IS };
