const { SEVERITY } = require('../verify_constants');

/**
 * CUSTOMER_SUPPORT Verification Pack
 * Example pack demonstrating horizontal scaling.
 */
module.exports = {
  id: 'customer_support',
  name: 'Customer Support / Refunds',
  description: 'Verifies customer support agent actions against the Stripe billing API.',
  provider: 'StripeAPI',
  claims: {
    'Refund issued within policy limit': { severity: SEVERITY.CRITICAL, category: 'financial' },
    'Subscription canceled successfully': { severity: SEVERITY.CRITICAL, category: 'operational' },
    'Customer notified of refund': { severity: SEVERITY.WARNING, category: 'communication' },
  }
};
