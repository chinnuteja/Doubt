const { SEVERITY } = require('../verify_constants');

/**
 * LEGAL_CONTRACTS Verification Pack
 * Example pack demonstrating horizontal scaling.
 */
module.exports = {
  id: 'legal_contracts',
  name: 'Legal Contract Review',
  description: 'Verifies AI paralegal claims against the raw text of signed DocuSign PDFs.',
  provider: 'DocuSignAPI',
  claims: {
    'Indemnification clause is mutual': { severity: SEVERITY.CRITICAL, category: 'risk' },
    'Governing law is Delaware': { severity: SEVERITY.WARNING, category: 'compliance' },
    'No automatic renewal clause present': { severity: SEVERITY.CRITICAL, category: 'financial' },
  }
};
