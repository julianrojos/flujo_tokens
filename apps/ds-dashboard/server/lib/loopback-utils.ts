/**
 * Loopback Address Utilities
 *
 * Shared utilities for checking if an address is a loopback address.
 */

/**
 * Check if an address is a loopback address.
 * Supports IPv4 (127.0.0.1), IPv6 (::1), IPv4-mapped IPv6 (::ffff:127.x.x.x),
 * and localhost hostname.
 */
export function isLoopbackAddress(address: string): boolean {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:127.')) return true;
  return normalized === 'localhost';
}
