"""
payment_gateway.py — Gateway abstraction for payment-service v2.3

Provides a clean interface to the underlying payment processor (Stripe-compatible).
Handles charge creation, capture, refund, and status queries.
"""

import logging
import hmac
import hashlib
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class Gateway:
    """Abstraction layer over the payment gateway API."""

    def __init__(self, api_key: str, webhook_secret: str, sandbox: bool = False):
        self.api_key = api_key
        self.webhook_secret = webhook_secret
        self.sandbox = sandbox
        self.base_url = (
            "https://api.sandbox.paygateway.io/v1"
            if sandbox
            else "https://api.paygateway.io/v1"
        )

    def create_charge(self, charge_request: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit a charge request to the payment gateway.

        Args:
            charge_request: Dictionary containing transaction_id, amount,
                          currency, billing details, and metadata.

        Returns:
            Gateway response with status, reference, and processing details.
        """
        required_fields = {'transaction_id', 'amount', 'currency'}
        missing = required_fields - set(charge_request.keys())
        if missing:
            raise ValueError(f"Missing required fields: {missing}")

        payload = {
            'idempotency_key': charge_request['transaction_id'],
            'amount': charge_request['amount'],
            'currency': charge_request['currency'],
            'billing_zip': charge_request.get('billing_zip'),
            'billing_country': charge_request.get('billing_country'),
            'metadata': charge_request.get('metadata', {}),
        }

        # In production, this would be an HTTP POST to self.base_url + '/charges'
        response = self._post('/charges', payload)

        logger.info(
            f"Gateway charge created: {response.get('reference')} "
            f"for {charge_request['amount']} {charge_request['currency']}"
        )
        return response

    def get_transaction(self, transaction_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a transaction record from the gateway."""
        response = self._get(f'/transactions/{transaction_id}')
        return response

    def create_refund(
        self, transaction_id: str, amount: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Issue a full or partial refund for a completed charge.

        Args:
            transaction_id: The original transaction to refund
            amount: Partial refund amount in cents; None for full refund
        """
        payload = {'transaction_id': transaction_id}
        if amount is not None:
            payload['amount'] = amount

        return self._post('/refunds', payload)

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """Verify that a webhook payload was sent by the gateway."""
        expected = hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def _post(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make an authenticated POST request to the gateway API."""
        # Stubbed — in production, uses requests/httpx with self.api_key
        return {
            'status': 'authorized',
            'reference': f'gw_{payload.get("idempotency_key", "unknown")}',
        }

    def _get(self, endpoint: str) -> Optional[Dict[str, Any]]:
        """Make an authenticated GET request to the gateway API."""
        # Stubbed — in production, uses requests/httpx with self.api_key
        return None
