/**
 * Loopback Address Utilities
 *
 * Shared utilities for checking if an address is a loopback address.
 */

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

// Define ConnInfo interface locally to avoid import issues
interface ConnInfo {
  remote?: {
    address?: string;
  };
}

/**
 * Extract remote address from socket connection first, then headers.
 * Uses real socket IP as primary source for security.
 * Only trusts forwarded headers when DS_TRUST_PROXY=1.
 */
export function getRemoteAddress(c: Context): string {
  // Try to get real socket IP first
  try {
    const connInfo = getConnInfo(c);
    if (connInfo?.remote?.address) {
      return String(connInfo.remote.address).trim();
    }
  } catch {
    // Fallback to headers if getConnInfo fails
  }
  
  const rawForwardedFor = c.req.header('x-forwarded-for');
  const rawRealIp = c.req.header('x-real-ip');
  const trustProxy = process.env.DS_TRUST_PROXY === '1';
  
  if (rawForwardedFor && trustProxy) {
    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
    // The first IP is the original client
    const firstHop = rawForwardedFor.split(',')[0].trim();
    return firstHop;
  }
  
  if (rawRealIp && trustProxy) {
    return String(rawRealIp).trim();
  }
  
  return '';
}

/**
 * Check if request is from loopback address.
 * Uses only IP headers for security; no host-based fallback to prevent spoofing.
 * Accepts optional connInfo for testability.
 */
export function isLoopbackRequest(c: Context, connInfo?: { remote?: { address?: string } } | null): boolean {
  const remoteAddress = connInfo?.remote?.address || getRemoteAddress(c);
  return remoteAddress ? isLoopbackAddress(remoteAddress) : false;
}

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
