"""
confirm_payment.py — Payment confirmation and status management for payment-service v2.3

Handles the confirmation step after a charge is authorized.
Updates payment status and triggers downstream notifications.
"""

import logging
import time
from typing import Dict, Any, Optional
from datetime import datetime
from database import get_connection_pool

logger = logging.getLogger(__name__)

CONFIRMATION_TIMEOUT = 30  # seconds
STATUS_PENDING = 'pending'
STATUS_CONFIRMED = 'confirmed'
STATUS_FAILED = 'failed'
STATUS_CANCELLED = 'cancelled'


class PaymentConfirmationService:
    """Manages the confirmation lifecycle of payment transactions."""

    def __init__(self, db_pool=None, notification_service=None):
        self.db_pool = db_pool or get_connection_pool()
        self.notification_service = notification_service

    def confirm_payment(self, transaction_id: str, gateway_response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Confirm a pending payment transaction after gateway authorization.

        This method:
        1. Reads the current payment status from the database
        2. Validates the gateway response
        3. Updates the payment status to 'confirmed'
        4. Triggers a confirmation notification to the user

        Args:
            transaction_id: The unique transaction identifier
            gateway_response: Response payload from the payment gateway

        Returns:
            Confirmation result with updated status
        """
        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()

            # Step 1: Read current payment status
            cursor.execute(
                "SELECT status, amount, currency, user_id "
                "FROM payments WHERE transaction_id = %s",
                (transaction_id,)
            )
            payment = cursor.fetchone()

            if not payment:
                return {'status': 'error', 'message': 'Transaction not found'}

            current_status = payment[0]
            amount = payment[1]
            currency = payment[2]
            user_id = payment[3]

            if current_status != STATUS_PENDING:
                return {
                    'status': 'error',
                    'message': f'Transaction is {current_status}, expected pending'
                }

            # Step 2: Validate gateway response
            if not self._validate_gateway_response(gateway_response, amount, currency):
                return {'status': 'error', 'message': 'Gateway response validation failed'}

            # Step 3: Update payment status to confirmed
            cursor.execute(
                "UPDATE payments SET status = %s, confirmed_at = %s, "
                "gateway_reference = %s WHERE transaction_id = %s",
                (STATUS_CONFIRMED, datetime.utcnow().isoformat(),
                 gateway_response.get('reference'), transaction_id)
            )
            conn.commit()

            # Step 4: Send confirmation notification
            if self.notification_service:
                self.notification_service.send_payment_confirmation(
                    user_id=user_id,
                    transaction_id=transaction_id,
                    amount=amount,
                    currency=currency,
                )

            logger.info(f"Payment {transaction_id} confirmed successfully")
            return {
                'status': 'confirmed',
                'transaction_id': transaction_id,
                'confirmed_at': datetime.utcnow().isoformat(),
            }

        finally:
            self.db_pool.release(conn)

    def cancel_pending_payment(self, transaction_id: str, reason: str = '') -> bool:
        """Cancel a pending payment that has not yet been confirmed."""
        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT status FROM payments WHERE transaction_id = %s",
                (transaction_id,)
            )
            payment = cursor.fetchone()
            if not payment or payment[0] != STATUS_PENDING:
                return False

            cursor.execute(
                "UPDATE payments SET status = %s, cancelled_at = %s, "
                "cancel_reason = %s WHERE transaction_id = %s",
                (STATUS_CANCELLED, datetime.utcnow().isoformat(),
                 reason, transaction_id)
            )
            conn.commit()
            logger.info(f"Payment {transaction_id} cancelled: {reason}")
            return True
        finally:
            self.db_pool.release(conn)

    def get_confirmation_status(self, transaction_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve the current confirmation status of a transaction."""
        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT status, amount, currency, confirmed_at, cancelled_at "
                "FROM payments WHERE transaction_id = %s",
                (transaction_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                'status': row[0],
                'amount': row[1],
                'currency': row[2],
                'confirmed_at': row[3],
                'cancelled_at': row[4],
            }
        finally:
            self.db_pool.release(conn)

    @staticmethod
    def _validate_gateway_response(
        response: Dict[str, Any], expected_amount: int, expected_currency: str
    ) -> bool:
        """Validate that the gateway response matches the expected charge."""
        if response.get('status') != 'authorized':
            return False
        if response.get('amount') != expected_amount:
            return False
        if response.get('currency') != expected_currency:
            return False
        return True
