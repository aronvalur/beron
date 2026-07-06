// Pricing configuration for Beron subscriptions.
// V1 note: billing is manual (no payment processor integration yet).

const CURRENCY = 'ISK';

const PLANS = {
  birthdays: {
    key: 'birthdays',
    label: 'Afmæli',
    description: 'Afmælisgjafir fyrir alla virka starfsmenn. Innifelur innkaup, pökkun og afhendingu.',
    pricePerEmployee: 1290
  },
  birthdays_christmas: {
    key: 'birthdays_christmas',
    label: 'Afmæli + Jól',
    description: 'Afmælisgjafir og árlegar jólagjafir fyrir alla virka starfsmenn. Innifelur innkaup, pökkun og afhendingu.',
    pricePerEmployee: 1890
  }
};

const SETUP_FEE = 19900;

// Flat handling fee charged on top of the gift budget for custom /
// special-occasion orders only (new hires, promotions, life events).
// Birthday and Christmas fulfillment is already bundled into the monthly
// per-employee subscription price above, so no separate fee applies there.
const CUSTOM_HANDLING_FEE = 3000;

function formatISK(amount) {
  return new Intl.NumberFormat('is-IS', { maximumFractionDigits: 0 }).format(amount) + ' kr.';
}

function computeInvoice(planType, activeEmployeeCount) {
  const plan = PLANS[planType] || PLANS.birthdays;
  const subtotal = plan.pricePerEmployee * activeEmployeeCount;
  return {
    plan,
    activeEmployeeCount,
    pricePerEmployee: plan.pricePerEmployee,
    subtotal,
    currency: CURRENCY
  };
}

module.exports = { PLANS, SETUP_FEE, CUSTOM_HANDLING_FEE, CURRENCY, formatISK, computeInvoice };
