/**
 * Shared SMTP Dispatch Coordinator
 * Prevents concurrent SMTP dispatches between Individual Email sends and Bulk Queue worker.
 * Ensures strict sequential execution across all outbound email channels.
 */

class SmtpDispatchCoordinator {
  constructor() {
    this.activeChannel = 'none'; // 'none' | 'individual' | 'bulk_worker'
    this.activeContext = null;
    this.lockAcquiredAt = null;
  }

  /**
   * Acquire exclusive right to transmit via SMTP
   * @param {'individual' | 'bulk_worker'} channel
   * @param {Object} context Metadata regarding the dispatch
   * @returns {Promise<{ success: boolean, reason?: string }>}
   */
  async acquireDispatch(channel, context = {}) {
    // Check if an existing operation timed out (> 60s max per email attempt)
    if (this.activeChannel !== 'none' && this.lockAcquiredAt) {
      const elapsedMs = Date.now() - this.lockAcquiredAt;
      if (elapsedMs > 60000) {
        console.warn(`[SmtpDispatchCoordinator] Stale dispatch lock detected (${this.activeChannel}, elapsed: ${elapsedMs}ms). Forcing release.`);
        this.releaseDispatch(this.activeChannel, true);
      }
    }

    if (this.activeChannel !== 'none') {
      const reason = this.activeChannel === 'bulk_worker'
        ? 'SMTP transport is currently transmitting a queued bulk campaign email. Sequential rate limiting is active.'
        : 'SMTP transport is currently transmitting an individual email. Please retry momentarily.';

      return {
        success: false,
        conflict: true,
        channel: this.activeChannel,
        reason,
      };
    }

    this.activeChannel = channel;
    this.activeContext = context;
    this.lockAcquiredAt = Date.now();

    return { success: true };
  }

  /**
   * Release transmission lock
   * @param {'individual' | 'bulk_worker'} channel
   * @param {boolean} force
   */
  releaseDispatch(channel, force = false) {
    if (force || this.activeChannel === channel) {
      this.activeChannel = 'none';
      this.activeContext = null;
      this.lockAcquiredAt = null;
    }
  }

  /**
   * Check if SMTP transport is currently actively transmitting
   */
  isBusy() {
    return this.activeChannel !== 'none';
  }

  /**
   * Get current dispatch state
   */
  getState() {
    return {
      isBusy: this.activeChannel !== 'none',
      activeChannel: this.activeChannel,
      activeContext: this.activeContext,
      lockAcquiredAt: this.lockAcquiredAt ? new Date(this.lockAcquiredAt).toISOString() : null,
      elapsedMs: this.lockAcquiredAt ? Date.now() - this.lockAcquiredAt : 0,
    };
  }
}

export const smtpDispatchCoordinator = new SmtpDispatchCoordinator();
