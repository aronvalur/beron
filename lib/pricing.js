// Pricing configuration for Beron subscriptions.
// V1 note: billing is manual (no payment processor integration yet).

const CURRENCY = 'ISK';

// Athugið: pricePerEmployee er hreint þjónustugjald (umsjón, pökkun og
// afhending) - sjálf gjafarupphæðin er ALLTAF greidd sérstaklega ofan á,
// fyrir öll tilefni (afmæli, jól og sérpöntun jafnt), sjá lib/billing.js.
// Orðalagið hér að neðan má aldrei gefa til kynna að gjafarupphæðin sjálf
// sé innifalin í þessari upphæð.
//
// Verðútreikningur (endurskoðað - sjá spjall): miðað við ~3.000 kr. í
// vinnu+akstur á hverja gjöf (pökkun + afhending), dreift á 12 mánuði:
//   Afmæli: 1 tilefni/ár x 3.000 kr. = 3.000 kr./ár = 250 kr./mán. í
//           kostnaði -> 450 kr./mán. með álagningu
//   Afmæli+Jól: 2 tilefni/ár x 3.000 kr. = 6.000 kr./ár = 500 kr./mán. í
//           kostnaði -> 850 kr./mán. með álagningu
// Þessar tölur eru áætlun þar til raunverulegur pökkunar-/aksturskostnaður
// er staðfestur - uppfæra hér um leið og betri gögn liggja fyrir.
const PLANS = {
  birthdays: {
    key: 'birthdays',
    label: 'Afmæli',
    description: 'Beron fylgist með og annast afmælisgjafir fyrir alla virka starfsmenn - umsjón, pökkun og afhending innifalin. Sjálf gjafarupphæðin greiðist sérstaklega eftir raunkostnaði.',
    pricePerEmployee: 450
  },
  birthdays_christmas: {
    key: 'birthdays_christmas',
    label: 'Afmæli + Jól',
    description: 'Beron fylgist með og annast afmælis- og árlegar jólagjafir fyrir alla virka starfsmenn - umsjón, pökkun og afhending innifalin. Sjálf gjafarupphæðin greiðist sérstaklega eftir raunkostnaði.',
    pricePerEmployee: 850
  }
};

const SETUP_FEE = 19900;

// Flat handling fee charged on top of the gift budget for custom /
// special-occasion orders only (new hires, promotions, life events).
// Birthday and Christmas orders don't get this extra fee because their
// packing/delivery labor is already priced into pricePerEmployee above -
// but the gift budget itself is billed separately for every order type.
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
