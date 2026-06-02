const { SEVERITY } = require('../verify_constants');

/**
 * DEVOPS_QA Verification Pack
 * Maps QA checklist claims to their severity and domain category.
 */
module.exports = {
  id: 'devops_qa',
  name: 'DevOps QA Verification',
  description: 'Verifies code review and deployment claims against CI/CD pipeline logs.',
  provider: 'GitHubActions',
  claims: {
    'SQL injection scan': { severity: SEVERITY.CRITICAL, category: 'security' },
    'Null/edge-case handling': { severity: SEVERITY.CRITICAL, category: 'reliability' },
    'Concurrency safety': { severity: SEVERITY.CRITICAL, category: 'reliability' },
    'Linting': { severity: SEVERITY.INFO, category: 'code_quality' },
    'Type checking': { severity: SEVERITY.INFO, category: 'code_quality' },
    'Code formatting': { severity: SEVERITY.INFO, category: 'code_quality' },
    'Unit tests': { severity: SEVERITY.WARNING, category: 'functional' },
    'Integration tests': { severity: SEVERITY.WARNING, category: 'functional' },
    'API contract validation': { severity: SEVERITY.WARNING, category: 'functional' },
    'Authentication verification': { severity: SEVERITY.CRITICAL, category: 'security' },
    'Webhook signature validation': { severity: SEVERITY.WARNING, category: 'security' },
    'Idempotency': { severity: SEVERITY.WARNING, category: 'reliability' },
    'Logging': { severity: SEVERITY.INFO, category: 'operational' },
    'Error handling': { severity: SEVERITY.WARNING, category: 'operational' },
  }
};
