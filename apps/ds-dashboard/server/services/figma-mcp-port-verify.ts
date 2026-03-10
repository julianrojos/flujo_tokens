/**
 * Figma MCP Port Verify Service
 *
 * Verifies that MCP is actually listening on the requested port.
 */

import { pingFigmaMcpService } from './figma-mcp-ping-service.ts';

const VERIFY_RETRY_DELAY_MS = 500;
const VERIFY_MAX_ATTEMPTS = 3;

/**
 * Verify that MCP is connected and responding on the specified port.
 * 
 * Strategy:
 * 1. Temporarily set FIGMA_WS_PORT to requested port
 * 2. Ping MCP service with timeout budget
 * 3. Check connected === true AND currentPort === requestedPort
 * 4. Restore original port
 * 
 * @param requestedPort - Port to verify
 * @param timeoutMs - Total timeout budget for verification (default 5000ms)
 * @returns true if MCP is connected on requestedPort, false otherwise
 */
export async function verifyMcpPort(
  requestedPort: number,
  timeoutMs: number = 5000
): Promise<boolean> {
  const originalPort = process.env.FIGMA_WS_PORT;
  const startedAt = Date.now();
  const totalBudgetMs = Math.max(1, Math.floor(timeoutMs));
  
  try {
    // Set target port for verification
    process.env.FIGMA_WS_PORT = String(requestedPort);
    
    // Attempt ping with timeout budget per attempt
    for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = totalBudgetMs - elapsedMs;
      
      // Abort if budget exhausted
      if (remainingMs <= 0) {
        return false;
      }
      
      // Split remaining budget across pending attempts.
      const pendingAttempts = VERIFY_MAX_ATTEMPTS - attempt + 1;
      const attemptTimeoutMs = Math.max(
        1,
        Math.min(remainingMs, Math.floor(remainingMs / pendingAttempts)),
      );
      
      try {
        const result = await pingFigmaMcpService({
          timeoutMs: attemptTimeoutMs,
          connectWaitMs: 0,
        });

        // Check: connected AND (if currentPort available, it matches requested)
        const isConnected = result.connected === true;
        const hasPortInfo = result.currentPort !== undefined && result.currentPort !== null;
        const isCorrectPort = hasPortInfo ? result.currentPort === requestedPort : true;

        if (isConnected && isCorrectPort) {
          return true;
        }

        // If connected but no port info, that's acceptable (older MCP version)
        if (isConnected && !hasPortInfo) {
          return true;
        }

        // If not connected but port matches, MCP is there but not ready
        if (isCorrectPort && !isConnected && hasPortInfo) {
          // Wait and retry
          if (attempt < VERIFY_MAX_ATTEMPTS) {
            const retryDelay = Math.min(
              VERIFY_RETRY_DELAY_MS,
              totalBudgetMs - (Date.now() - startedAt),
            );
            if (retryDelay <= 0) {
              return false;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }
        
        // Port doesn't match or max attempts reached
        return false;
      } catch {
        // Ping failed, retry if budget remains
        if (attempt < VERIFY_MAX_ATTEMPTS) {
          const retryDelay = Math.min(
            VERIFY_RETRY_DELAY_MS,
            totalBudgetMs - (Date.now() - startedAt),
          );
          if (retryDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
          continue;
        }
        return false;
      }
    }
    
    return false;
  } finally {
    // Always restore original port
    if (originalPort !== undefined) {
      process.env.FIGMA_WS_PORT = originalPort;
    }
  }
}
