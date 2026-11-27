import os from 'os';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * WorkerLock
 * Database-backed distributed lock manager using singleton queue_worker_state
 * with fencing tokens (lock_generation) and automatic stale-worker takeover.
 */
export class WorkerLock {
  constructor(options = {}) {
    this.workerId = options.workerId || `worker-${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 5000;
    this.staleThresholdMs = options.staleThresholdMs || 30000;
    this.heartbeatTimer = null;
    this.isHeld = false;
    this.lockGeneration = 0;
  }

  getWorkerId() {
    return this.workerId;
  }

  isLockHeld() {
    return this.isHeld;
  }

  getLockGeneration() {
    return this.lockGeneration;
  }

  /**
   * Attempt to acquire the global worker lease
   * @returns {Promise<{ acquired: boolean, workerId: string, generation: number, reason?: string }>}
   */
  async acquireLock() {
    const now = new Date();

    try {
      // 1. Fetch current singleton worker state
      const { data: current, error: fetchErr } = await supabaseAdmin
        .from('queue_worker_state')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();

      if (fetchErr) {
        this.isHeld = false;
        this.stopHeartbeat();
        return {
          acquired: false,
          reason: `Database unavailable querying queue_worker_state: ${fetchErr.message}`,
        };
      }

      const isStale = current && current.heartbeat_at
        ? (now.getTime() - new Date(current.heartbeat_at).getTime()) > this.staleThresholdMs
        : true;

      const isEligible = !current ||
        current.worker_status === 'idle' ||
        current.worker_status === 'stopped' ||
        current.worker_status === 'failed' ||
        isStale;

      if (!isEligible && current.worker_id !== this.workerId) {
        return {
          acquired: false,
          activeWorkerId: current.worker_id,
          heartbeatAt: current.heartbeat_at,
          reason: `Active worker '${current.worker_id}' holds valid lease (heartbeat: ${current.heartbeat_at}).`,
        };
      }

      const nextGeneration = (current?.lock_generation || 0) + 1;

      // 2. Claim the lease atomically
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('queue_worker_state')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          worker_id: this.workerId,
          lock_generation: nextGeneration,
          worker_status: 'active',
          heartbeat_at: now.toISOString(),
          last_started_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();

      if (updateErr) {
        console.error('[WorkerLock] Failed to claim lease:', updateErr.message);
        return { acquired: false, reason: updateErr.message };
      }

      this.isHeld = true;
      this.lockGeneration = nextGeneration;

      // 3. Start periodic heartbeat
      this.startHeartbeat();

      return {
        acquired: true,
        workerId: this.workerId,
        generation: this.lockGeneration,
      };
    } catch (err) {
      console.error('[WorkerLock] Unexpected acquisition exception:', err);
      return { acquired: false, reason: err.message };
    }
  }

  /**
   * Start periodic heartbeat to maintain lease
   */
  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      if (!this.isHeld) return;

      try {
        const { data, error } = await supabaseAdmin
          .from('queue_worker_state')
          .update({
            heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .eq('worker_id', this.workerId)
          .eq('lock_generation', this.lockGeneration)
          .select('lock_generation');

        if (error || !data || data.length === 0) {
          console.warn('[WorkerLock] Heartbeat failed or fence token superseded. Relinquishing worker lock.');
          this.isHeld = false;
          this.stopHeartbeat();
        }
      } catch (err) {
        console.error('[WorkerLock] Heartbeat ping error:', err.message);
      }
    }, this.heartbeatIntervalMs);

    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Release the worker lease on graceful shutdown
   */
  async releaseLock() {
    this.stopHeartbeat();

    if (!this.isHeld) return;

    try {
      await supabaseAdmin
        .from('queue_worker_state')
        .update({
          worker_status: 'stopped',
          last_stopped_at: new Date().toISOString(),
          current_recipient_id: null,
          current_attempt_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .eq('worker_id', this.workerId)
        .eq('lock_generation', this.lockGeneration);
    } catch (err) {
      console.warn('[WorkerLock] Error during graceful lease release:', err.message);
    } finally {
      this.isHeld = false;
    }
  }
}

export const globalWorkerLock = new WorkerLock();
