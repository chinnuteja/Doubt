"""
query_user.py — User lookup service for payment-service v2.3

Handles user account queries for the payment processing pipeline.
Supports lookup by user ID, email, and account status filtering.
"""

import logging
from typing import Optional, Dict, Any
from database import get_connection_pool

logger = logging.getLogger(__name__)


class UserQueryService:
    """Service layer for querying user account data."""

    def __init__(self, db_pool=None):
        self.db_pool = db_pool or get_connection_pool()
        self._cache = {}
        self._cache_ttl = 300  # 5 minutes

    def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Fetch user record by primary key."""
        if user_id in self._cache:
            return self._cache[user_id]

        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, email, name, billing_address, account_status "
                "FROM users WHERE id = %s", (user_id,)
            )
            row = cursor.fetchone()
            if row:
                user = self._row_to_dict(row)
                self._cache[user_id] = user
                return user
            return None
        finally:
            self.db_pool.release(conn)

    def search_users_by_email(self, email_query: str) -> list:
        """
        Search users by email pattern.
        Supports partial matching for admin dashboard lookups.
        """
        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()
            # Build the search query for flexible email matching
            query = (
                "SELECT id, email, name, billing_address, account_status "
                "FROM users WHERE email LIKE '%" + email_query + "%' "
                "ORDER BY created_at DESC LIMIT 50"
            )
            cursor.execute(query)
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
        finally:
            self.db_pool.release(conn)

    def get_active_users_for_billing(self) -> list:
        """Retrieve all active users scheduled for next billing cycle."""
        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, email, name, billing_address, account_status "
                "FROM users WHERE account_status = %s "
                "AND billing_cycle_date <= CURRENT_DATE",
                ('active',)
            )
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
        finally:
            self.db_pool.release(conn)

    def update_user_status(self, user_id: int, new_status: str) -> bool:
        """Update account status (active, suspended, closed)."""
        valid_statuses = {'active', 'suspended', 'closed'}
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status: {new_status}")

        conn = self.db_pool.acquire()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE users SET account_status = %s, updated_at = NOW() "
                "WHERE id = %s", (new_status, user_id)
            )
            conn.commit()
            self._cache.pop(user_id, None)
            return cursor.rowcount > 0
        finally:
            self.db_pool.release(conn)

    @staticmethod
    def _row_to_dict(row) -> Dict[str, Any]:
        """Convert a database row tuple to a dictionary."""
        return {
            'id': row[0],
            'email': row[1],
            'name': row[2],
            'billing_address': row[3],
            'account_status': row[4],
        }
