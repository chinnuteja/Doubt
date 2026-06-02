# Pull Request #847: Payment Service v2.3 — Billing Cycle Overhaul

**Author:** sarah.chen  
**Branch:** `feature/billing-v2.3` → `main`  
**Created:** 2026-05-28T14:32:00Z  
**Reviewers:** QA Agent (automated)

---

## Summary

This PR refactors the billing and payment confirmation flow for payment-service v2.3. Key changes:

- Refactored `query_user.py` to add email search for admin dashboard lookups
- Updated `process_payment.py` with new currency support (CAD, AUD) and charge limits
- Rewrote `confirm_payment.py` to handle async gateway confirmations via webhook
- Added `webhook_handler.py` for processing gateway event notifications
- Minor cleanup in `database.py` connection pool stats

## Files Changed

| File | Changes |
|------|---------|
| `query_user.py` | +32 -8 |
| `process_payment.py` | +45 -12 |
| `confirm_payment.py` | +68 -23 |
| `payment_gateway.py` | +15 -5 |
| `webhook_handler.py` | +89 (new file) |
| `database.py` | +4 -2 |

## Testing Notes

All existing unit tests should continue to pass. New tests have been added for the webhook handler and the updated billing flow. Please run the full QA checklist before approving.

## Related Issues

- PAYMENTS-1247: Add CAD/AUD currency support
- PAYMENTS-1251: Webhook-based confirmation flow
- PAYMENTS-1260: Admin email search for user lookup
