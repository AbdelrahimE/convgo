/**
 * Centralized Session Manager
 *
 * This utility provides a centralized mechanism for managing Supabase sessions
 * with a lock mechanism to prevent concurrent refresh token requests.
 *
 * Problem Solved:
 * - Prevents "Invalid Refresh Token: Refresh Token Not Found" errors
 * - Ensures only one refresh request happens at a time
 * - Coordinates session refresh across multiple components
 *
 * Key Features:
 * - Lock mechanism prevents concurrent refresh attempts
 * - Promise sharing for concurrent callers
 * - Centralized session validation logic
 * - Comprehensive logging for debugging
 *
 * Usage:
 * ```typescript
 * import { sessionManager } from '@/utils/sessionManager';
 *
 * // Check if session is valid
 * if (!sessionManager.isSessionValid(session)) {
 *   // Attempt refresh
 *   const success = await sessionManager.refreshSession();
 *   if (!success) {
 *     // Handle failure
 *   }
 * }
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import logger from '@/utils/logger';
import type { Session } from '@supabase/supabase-js';

class SessionManager {
  /**
   * Lock flag to prevent concurrent refresh attempts
   */
  private isRefreshing = false;

  /**
   * Shared promise for concurrent refresh requests
   * When multiple components try to refresh simultaneously,
   * they all wait for the same promise instead of creating new requests
   */
  private refreshPromise: Promise<boolean> | null = null;

  /**
   * Timestamp of last successful refresh
   * Used for rate limiting and debugging
   */
  private lastRefreshTime: number = 0;

  /**
   * Minimum time between refresh attempts (in milliseconds)
   * Prevents too many refresh requests in a short time
   */
  private readonly MIN_REFRESH_INTERVAL = 5000; // 5 seconds

  /**
   * Counter for refresh attempts
   * Useful for monitoring and debugging
   */
  private refreshAttempts = 0;

  /**
   * Counter for successful refreshes
   */
  private successfulRefreshes = 0;

  /**
   * Counter for failed refreshes
   */
  private failedRefreshes = 0;

  /**
   * Main method to refresh the session
   *
   * This method implements a lock mechanism to prevent concurrent refresh requests.
   * If a refresh is already in progress, subsequent calls will wait for the
   * same promise instead of creating new refresh requests.
   *
   * @returns Promise<boolean> - true if refresh succeeded, false otherwise
   *
   * @example
   * ```typescript
   * const success = await sessionManager.refreshSession();
   * if (success) {
   *   console.log('Session refreshed successfully');
   * } else {
   *   console.log('Session refresh failed');
   * }
   * ```
   */
  async refreshSession(): Promise<boolean> {
    // If already refreshing, return the existing promise
    // This prevents multiple concurrent refresh requests
    if (this.isRefreshing && this.refreshPromise) {
      logger.log('SessionManager: Refresh already in progress, waiting for completion...');
      return this.refreshPromise;
    }

    // Check rate limiting - prevent too many refresh attempts
    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastRefreshTime;

    if (timeSinceLastRefresh < this.MIN_REFRESH_INTERVAL) {
      logger.warn(
        `SessionManager: Refresh attempted too soon (${timeSinceLastRefresh}ms since last refresh). ` +
        `Minimum interval is ${this.MIN_REFRESH_INTERVAL}ms. Skipping.`
      );
      return false;
    }

    // Set lock and create new refresh promise
    this.isRefreshing = true;
    this.refreshAttempts++;

    logger.log(
      `SessionManager: Starting refresh attempt #${this.refreshAttempts} ` +
      `(${this.successfulRefreshes} successful, ${this.failedRefreshes} failed so far)`
    );

    // Create the refresh promise
    this.refreshPromise = this._doRefresh();

    try {
      // Wait for refresh to complete
      const result = await this.refreshPromise;
      return result;
    } finally {
      // Release lock after completion
      this.isRefreshing = false;
      this.refreshPromise = null;
      this.lastRefreshTime = Date.now();
    }
  }

  /**
   * Internal method that performs the actual refresh
   * This is separated from the public method to handle locking logic
   *
   * @private
   * @returns Promise<boolean>
   */
  private async _doRefresh(): Promise<boolean> {
    try {
      logger.log('SessionManager: Executing refresh request to Supabase...');

      // Call Supabase refresh API
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        logger.error('SessionManager: Refresh failed with error:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        this.failedRefreshes++;
        return false;
      }

      if (data.session) {
        logger.log('SessionManager: Session refreshed successfully', {
          expiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
          userId: data.session.user.id,
          email: data.session.user.email,
        });
        this.successfulRefreshes++;
        return true;
      }

      logger.warn('SessionManager: No session returned from refresh request');
      this.failedRefreshes++;
      return false;

    } catch (error: any) {
      logger.error('SessionManager: Exception during refresh:', {
        message: error?.message,
        stack: error?.stack,
      });
      this.failedRefreshes++;
      return false;
    }
  }

  /**
   * Check if a session is valid (not expired or about to expire)
   *
   * @param session - The Supabase session object
   * @param bufferMinutes - Minutes before expiry to consider session invalid (default: 2)
   * @returns boolean - true if session is valid, false if expired or about to expire
   *
   * @example
   * ```typescript
   * if (!sessionManager.isSessionValid(session)) {
   *   // Session is invalid or about to expire
   *   await sessionManager.refreshSession();
   * }
   * ```
   */
  isSessionValid(session: Session | null, bufferMinutes: number = 2): boolean {
    if (!session) {
      logger.log('SessionManager: Session is null, considered invalid');
      return false;
    }

    if (!session.expires_at) {
      logger.log('SessionManager: Session has no expiration time, considered invalid');
      return false;
    }

    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    const bufferTime = bufferMinutes * 60 * 1000; // Convert to milliseconds
    const timeRemaining = expiresAt.getTime() - now.getTime();

    const isValid = timeRemaining > bufferTime;

    if (!isValid) {
      logger.warn('SessionManager: Session is invalid or about to expire', {
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
        minutesRemaining: Math.floor(timeRemaining / 60000),
        bufferMinutes,
      });
    }

    return isValid;
  }

  /**
   * Get the number of minutes until the session expires
   *
   * @param session - The Supabase session object
   * @returns number - Minutes until expiry (0 if expired or invalid)
   *
   * @example
   * ```typescript
   * const minutesRemaining = sessionManager.getMinutesUntilExpiry(session);
   * if (minutesRemaining < 5) {
   *   // Show warning to user
   * }
   * ```
   */
  getMinutesUntilExpiry(session: Session | null): number {
    if (!session?.expires_at) {
      return 0;
    }

    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    const millisecondsRemaining = expiresAt.getTime() - now.getTime();

    return Math.max(0, millisecondsRemaining / (1000 * 60));
  }

  /**
   * Get statistics about session refresh operations
   * Useful for monitoring and debugging
   *
   * @returns Object with refresh statistics
   */
  getStats() {
    return {
      totalAttempts: this.refreshAttempts,
      successful: this.successfulRefreshes,
      failed: this.failedRefreshes,
      successRate: this.refreshAttempts > 0
        ? ((this.successfulRefreshes / this.refreshAttempts) * 100).toFixed(2) + '%'
        : '0%',
      isCurrentlyRefreshing: this.isRefreshing,
      lastRefreshTime: this.lastRefreshTime > 0
        ? new Date(this.lastRefreshTime).toISOString()
        : 'Never',
    };
  }

  /**
   * Reset statistics
   * Useful for testing or when you want to start fresh
   */
  resetStats() {
    this.refreshAttempts = 0;
    this.successfulRefreshes = 0;
    this.failedRefreshes = 0;
    this.lastRefreshTime = 0;
    logger.log('SessionManager: Statistics reset');
  }

  /**
   * Check if a refresh is currently in progress
   * Useful for UI components to show loading states
   *
   * @returns boolean
   */
  isRefreshInProgress(): boolean {
    return this.isRefreshing;
  }
}

/**
 * Singleton instance of SessionManager
 * Export this to use throughout the application
 */
export const sessionManager = new SessionManager();

/**
 * Export the class as well for testing purposes
 */
export { SessionManager };
