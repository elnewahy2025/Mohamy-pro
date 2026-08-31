import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis/redis.service';

const INCREMENT_WITH_EXPIRY_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/**
 * Low-level Redis primitive for abuse counters and lockout state. Each key is a
 * fixed-window INCR bucket; the counter and lockout markers are atomic and fail
 * open on a per-call basis (the caller decides the overall fail-closed policy).
 */
@Injectable()
export class AbuseCounterService {
  private readonly logger = new Logger(AbuseCounterService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Atomically increment the fixed-window bucket for `scope` and return the new
   * count. Returns null when Redis is unavailable (caller decides how to react).
   */
  async increment(scope: string, ttlSeconds: number): Promise<number | null> {
    try {
      const raw = await this.redis
        .getClient()
        .eval(INCREMENT_WITH_EXPIRY_SCRIPT, 1, scope, ttlSeconds);
      const count = Number(raw);
      return Number.isFinite(count) ? count : null;
    } catch (error) {
      this.logger.warn({
        message: 'Abuse counter unavailable',
        scope,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return null;
    }
  }

  /** Read the current bucket count without incrementing. */
  async peek(scope: string): Promise<number | null> {
    try {
      const raw = await this.redis.getClient().get(scope);
      return raw === null ? 0 : Number(raw);
    } catch {
      return null;
    }
  }

  /**
   * Set a lockout marker with TTL. Returns true when Redis accepted the write.
   */
  async setMarker(scope: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis
        .getClient()
        .set(scope, '1', 'EX', ttlSeconds);
      return result === 'OK';
    } catch (error) {
      this.logger.warn({
        message: 'Abuse marker write failed',
        scope,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return false;
    }
  }

  /** True when a lockout marker is present for `scope`. */
  async hasMarker(scope: string): Promise<boolean> {
    try {
      return (await this.redis.getClient().exists(scope)) === 1;
    } catch {
      return false;
    }
  }

  /** Delete a lockout marker (lock release). */
  async clearMarker(scope: string): Promise<boolean> {
    try {
      return (await this.redis.getClient().del(scope)) > 0;
    } catch {
      return false;
    }
  }

  static scopedKey(prefix: string, value: string, bucket: string): string {
    const digest = createHash('sha256')
      .update(value)
      .digest('hex')
      .slice(0, 32);
    return `mohamy:abuse:${prefix}:${digest}:${bucket}`;
  }
}
