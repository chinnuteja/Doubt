"""
database.py — Database connection management for payment-service v2.3

Provides connection pooling and health checks for the PostgreSQL backend.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_POOL_SIZE = 10
DEFAULT_MAX_OVERFLOW = 5
DEFAULT_TIMEOUT = 30


class ConnectionPool:
    """Simple connection pool for PostgreSQL connections."""

    def __init__(
        self,
        dsn: str,
        pool_size: int = DEFAULT_POOL_SIZE,
        max_overflow: int = DEFAULT_MAX_OVERFLOW,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.dsn = dsn
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.timeout = timeout
        self._available = []
        self._in_use = set()

    def acquire(self):
        """Acquire a connection from the pool."""
        if self._available:
            conn = self._available.pop()
        else:
            conn = self._create_connection()
        self._in_use.add(id(conn))
        return conn

    def release(self, conn):
        """Release a connection back to the pool."""
        conn_id = id(conn)
        if conn_id in self._in_use:
            self._in_use.discard(conn_id)
            if len(self._available) < self.pool_size:
                self._available.append(conn)

    def health_check(self) -> bool:
        """Verify database connectivity."""
        try:
            conn = self.acquire()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            self.release(conn)
            return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

    def _create_connection(self):
        """Create a new database connection."""
        # Stubbed — in production, uses psycopg2.connect(self.dsn)
        return _StubConnection()

    @property
    def stats(self):
        """Return pool utilization statistics."""
        return {
            'available': len(self._available),
            'in_use': len(self._in_use),
            'pool_size': self.pool_size,
        }


class _StubConnection:
    """Stub connection for development and testing."""

    def cursor(self):
        return _StubCursor()

    def commit(self):
        pass

    def rollback(self):
        pass


class _StubCursor:
    """Stub cursor for development and testing."""

    def execute(self, query, params=None):
        pass

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    @property
    def rowcount(self):
        return 0


_default_pool: Optional[ConnectionPool] = None


def get_connection_pool(dsn: str = 'postgresql://localhost/payments') -> ConnectionPool:
    """Get or create the default connection pool."""
    global _default_pool
    if _default_pool is None:
        _default_pool = ConnectionPool(dsn=dsn)
    return _default_pool
