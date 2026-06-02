"""
webhook_handler.py — Webhook processing for payment-service v2.3

Receives and processes asynchronous webhook notifications from the payment gateway.
Handles charge.succeeded, charge.failed, refund.created, and dispute.opened events.
"""

import logging
import json
from typing import Dict, Any, Callable
from payment_gateway import Gateway
from confirm_payment import PaymentConfirmationService

logger = logging.getLogger(__name__)

EVENT_HANDLERS = {}


def register_handler(event_type: str):
    """Decorator to register a webhook event handler."""
    def decorator(func: Callable):
        EVENT_HANDLERS[event_type] = func
        return func
    return decorator


class WebhookProcessor:
    """Processes incoming webhook events from the payment gateway."""

    def __init__(self, gateway: Gateway, confirmation_service: PaymentConfirmationService):
        self.gateway = gateway
        self.confirmation_service = confirmation_service
        self._processed_events = set()

    def handle_webhook(self, raw_payload: bytes, signature: str) -> Dict[str, Any]:
        """
        Process an incoming webhook request.

        Args:
            raw_payload: Raw request body bytes
            signature: Webhook signature header value

        Returns:
            Processing result with status and any actions taken
        """
        # Verify authenticity
        if not self.gateway.verify_webhook_signature(raw_payload, signature):
            logger.warning("Webhook signature verification failed")
            return {'status': 'rejected', 'reason': 'invalid_signature'}

        # Parse payload
        try:
            event = json.loads(raw_payload)
        except json.JSONDecodeError:
            return {'status': 'rejected', 'reason': 'invalid_json'}

        event_id = event.get('id')
        event_type = event.get('type')

        # Dedup check
        if event_id in self._processed_events:
            return {'status': 'duplicate', 'event_id': event_id}
        self._processed_events.add(event_id)

        # Route to handler
        handler = EVENT_HANDLERS.get(event_type)
        if not handler:
            logger.info(f"No handler for event type: {event_type}")
            return {'status': 'ignored', 'event_type': event_type}

        try:
            result = handler(self, event.get('data', {}))
            logger.info(f"Webhook {event_id} ({event_type}) processed: {result}")
            return {'status': 'processed', 'event_id': event_id, 'result': result}
        except Exception as e:
            logger.error(f"Error processing webhook {event_id}: {e}")
            return {'status': 'error', 'event_id': event_id, 'error': str(e)}


@register_handler('charge.succeeded')
def handle_charge_succeeded(processor: WebhookProcessor, data: Dict[str, Any]):
    """Handle a successful charge notification."""
    transaction_id = data.get('transaction_id')
    return processor.confirmation_service.confirm_payment(transaction_id, data)


@register_handler('charge.failed')
def handle_charge_failed(processor: WebhookProcessor, data: Dict[str, Any]):
    """Handle a failed charge notification."""
    transaction_id = data.get('transaction_id')
    reason = data.get('failure_reason', 'unknown')
    logger.warning(f"Charge failed for {transaction_id}: {reason}")
    return {'action': 'charge_failed', 'transaction_id': transaction_id}


@register_handler('refund.created')
def handle_refund_created(processor: WebhookProcessor, data: Dict[str, Any]):
    """Handle a refund creation notification."""
    transaction_id = data.get('original_transaction_id')
    refund_amount = data.get('amount')
    logger.info(f"Refund of {refund_amount} created for {transaction_id}")
    return {'action': 'refund_recorded', 'transaction_id': transaction_id}
