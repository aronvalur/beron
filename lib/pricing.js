// Pricing configuration for Beron subscriptions.
// V1 note: billing is manual (no payment processor integration yet).

const CURRENCY = 'ISK';

// Athugið: pricePerEmployee er hreint þjónustugjald (umsjón, pökkun og
// afhending) - sjálf gjafarupphæðin er ALLTAF greidd sérstaklega ofan á,
// fyrir öll tilefni (afmæli, jól og sérpöntun jafnt), sjá lib/billing.js.
// Orðalagið hér að neðan má aldrei gefa til kynna að gjafarupphæðin sjálf
// sé innifalin í þessari upphæð.
//
// Verðútreikningur (endurskoðað - sjá spjall): afmæli og jól hafa ólíka
// kostnaðarbyggingu, ekki bara "tvöfalt fleiri tilefni":
//   Afmæli: hvert afmæli er á sínum eigin degi hjá hverjum starfsmanni,
//           svo hver pöntun þarf sína eigin ferð - fullur kostnaður
//           (~3.000 kr. í vinnu+akstur) á hverja gjöf.
//           1 tilefni/ár x 3.000 kr. = 250 kr./mán. í kostnaði
//           -> 450 kr./mán. með álagningu
//   Jól:    flestir kjósa afhendingu á skrifstofuna, sem þýðir EIN ferð
//           fyrir allt fyrirtækið óháð stærð - akstur deilist á alla
//           starfsmenn í einu, bara pökkun er áfram per starfsmann.
//           Fyrir meðalstórt fyrirtæki (~20-25 starfsmenn) verður
//           kostnaður á starfsmann því nær 1.100 kr./ár, ekki 3.000 kr.
//           -> jólaviðbótin verður ~200 kr./mán. með álagningu, ekki 400
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
    pricePerEmployee: 650
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
