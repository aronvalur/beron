// Shared month-based billing math, used both by the HR-facing billing page
// (their own company only) and Beron HQ's finance worksheet (every company).
// Kept in one place so "what counts as this month's gift cost" can't drift
// between the two views.

const store = require('../db/store');
const { computeInvoice } = require('./pricing');

// The date that determines which month a gift order "belongs to" for
// billing purposes: custom orders use their explicit delivery date,
// birthday/christmas orders use the date of the event they're linked to.
function orderMonthDate(order) {
  if (order.gift_type === 'custom' && order.delivery_date) return order.delivery_date;
  if (order.event_id) {
    const event = store.find('events', order.event_id);
    if (event) return event.date;
  }
  return order.delivery_date || null;
}

function ordersForCompanyMonth(companyId, year, monthIndex) {
  return store
    .where('giftOrders', (o) => o.company_id === companyId && o.status !== 'cancelled')
    .filter((o) => {
      const dateStr = orderMonthDate(o);
      if (!dateStr) return false;
      const d = new Date(dateStr + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    });
}

// Full billing breakdown for one company for a given month: gift costs,
// custom-order handling fees, and the recurring per-employee subscription.
function billingForCompanyMonth(company, year, monthIndex) {
  const activeEmployeeCount = store.where('employees', (e) => e.company_id === company.id && e.active).length;
  const invoice = computeInvoice(company.subscription_plan, activeEmployeeCount);

  const orders = ordersForCompanyMonth(company.id, year, monthIndex);
  const giftCostTotal = orders.reduce((sum, o) => sum + (Number(o.budget_amount) || 0), 0);
  const handlingFeeTotal = orders.reduce((sum, o) => sum + (Number(o.handling_fee) || 0), 0);
  const giftChargeTotal = giftCostTotal + handlingFeeTotal;
  const subscriptionTotal = invoice.subtotal;

  return {
    company,
    activeEmployeeCount,
    pricePerEmployee: invoice.pricePerEmployee,
    planLabel: invoice.plan.label,
    orderCount: orders.length,
    giftCostTotal,
    handlingFeeTotal,
    giftChargeTotal,
    subscriptionTotal,
    grandTotal: giftChargeTotal + subscriptionTotal
  };
}

module.exports = { orderMonthDate, ordersForCompanyMonth, billingForCompanyMonth };
