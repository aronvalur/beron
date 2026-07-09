// Icelandic display labels for internal (English) enum values stored in the
// data. CSS classes and stored values stay in English (e.g. "badge-pending",
// status === 'pending') so nothing in the data model has to change - these
// maps only control what text is shown to the user.

const statusLabels = {
  pending: 'Í bið',
  ordered: 'Pantað',
  shipped: 'Sent í dreifingu',
  delivered: 'Afhent',
  cancelled: 'Hætt við',
  upcoming: 'Væntanlegt',
  processed: 'Í vinnslu',
  completed: 'Lokið',
  skipped: 'Sleppt'
};

const eventTypeLabels = {
  birthday: 'Afmæli',
  christmas: 'Jól',
  custom: 'Sértilefni'
};

const deliveryPreferenceLabels = {
  to_employee: 'Heim til starfsmanns',
  to_hr_office: 'Á skrifstofu fyrirtækisins'
};

const roleLabels = {
  admin: 'Tengiliður fyrirtækis',
  superadmin: 'Starfsmaður Beron'
};

const leadStatusLabels = {
  new: 'Ný fyrirspurn',
  contacted: 'Haft samband',
  closed: 'Lokið'
};

function statusLabel(value) {
  return statusLabels[value] || value;
}

function leadStatusLabel(value) {
  return leadStatusLabels[value] || value;
}

function eventTypeLabel(value) {
  return eventTypeLabels[value] || value;
}

// companyName is optional - when given, "to_hr_office" reads as "Á skrifstofu
// <fyrirtæki>" instead of the generic fallback, so it's clear exactly whose
// office the gift goes to.
function deliveryPreferenceLabel(value, companyName) {
  if (value === 'to_hr_office' && companyName) return `Á skrifstofu ${companyName}`;
  return deliveryPreferenceLabels[value] || value;
}

function roleLabel(value) {
  return roleLabels[value] || value;
}

module.exports = {
  statusLabels,
  eventTypeLabels,
  deliveryPreferenceLabels,
  roleLabels,
  leadStatusLabels,
  statusLabel,
  eventTypeLabel,
  deliveryPreferenceLabel,
  roleLabel,
  leadStatusLabel
};
