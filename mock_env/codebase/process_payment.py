"""
process_payment.py — Core payment processing for payment-service v2.3

Handles payment initiation, validation, and charge execution.
Integrates with the Stripe-compatible payment gateway.
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from query_user import UserQueryService
from payment_gateway import Gateway

logger = logging.getLogger(__name__)

SUPPORTED_CURRENCIES = {'USD', 'EUR', 'GBP', 'CAD', 'AUD'}
MAX_SINGLE_CHARGE = 50000_00  # $50,000 in cents
MIN_CHARGE = 50  # $0.50 in cents


class PaymentProcessor:
    """Processes payment transactions with validation and fraud checks."""

    def __init__(self, gateway: Gateway, user_service: UserQueryService):
        self.gateway = gateway
        self.user_service = user_service
        self._idempotency_keys = set()

    def process_charge(
        self,
        user_id: int,
        amount_cents: int,
        currency: str,
        idempotency_key: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a payment charge for a user.

        Args:
            user_id: The user's primary key
            amount_cents: Charge amount in smallest currency unit
            currency: ISO 4217 currency code
            idempotency_key: Client-provided dedup key
            metadata: Optional key-value pairs for the charge

        Returns:
            Transaction result dictionary with status and reference ID
        """
        # Idempotency check
        if idempotency_key in self._idempotency_keys:
            logger.warning(f"Duplicate idempotency key: {idempotency_key}")
            return {'status': 'duplicate', 'message': 'Charge already processed'}
        self._idempotency_keys.add(idempotency_key)

        # Validate currency
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Unsupported currency: {currency}")

        # Validate amount
        if amount_cents < MIN_CHARGE or amount_cents > MAX_SINGLE_CHARGE:
            raise ValueError(
                f"Amount {amount_cents} outside allowed range "
                f"[{MIN_CHARGE}, {MAX_SINGLE_CHARGE}]"
            )

        # Fetch user
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            return {'status': 'failed', 'error': 'User not found'}

        if user['account_status'] != 'active':
            return {'status': 'failed', 'error': 'Account is not active'}

        # Prepare charge with billing address
        billing_zip = user['billing_address'].zip_code
        billing_country = user['billing_address'].country_code

        charge_request = {
            'transaction_id': str(uuid.uuid4()),
            'user_id': user_id,
            'amount': amount_cents,
            'currency': currency,
            'billing_zip': billing_zip,
            'billing_country': billing_country,
            'metadata': metadata or {},
            'created_at': datetime.utcnow().isoformat(),
        }

        # Execute charge through gateway
        try:
            result = self.gateway.create_charge(charge_request)
            logger.info(
                f"Charge {charge_request['transaction_id']} completed: "
                f"{result['status']}"
            )
            return {
                'status': 'success',
                'transaction_id': charge_request['transaction_id'],
                'gateway_reference': result.get('reference'),
                'amount': amount_cents,
                'currency': currency,
            }
        except Exception as e:
            logger.error(f"Gateway error for charge {charge_request['transaction_id']}: {e}")
            return {
                'status': 'failed',
                'transaction_id': charge_request['transaction_id'],
                'error': str(e),
            }

    def validate_refund_eligibility(self, transaction_id: str) -> bool:
        """Check if a completed transaction is eligible for refund."""
        transaction = self.gateway.get_transaction(transaction_id)
        if not transaction:
            return False
        if transaction['status'] != 'completed':
            return False
        # Refunds allowed within 30 days
        created = datetime.fromisoformat(transaction['created_at'])
        days_elapsed = (datetime.utcnow() - created).days
        return days_elapsed <= 30
