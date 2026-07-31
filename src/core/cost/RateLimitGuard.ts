import type { RateLimitPort, RateLimitResult } from "../../port/cost/RateLimitPort.js";

/**
 * Thin facade for HTTP/worker entry points — one RPM check per execution request.
 */
export class RateLimitGuard {
  constructor(private readonly rateLimit: RateLimitPort) {}

  async checkRpm(userId: string): Promise<RateLimitResult> {
    return this.rateLimit.checkAndConsume({ userId, rpmDelta: 1, tpmDelta: 0 });
  }
}
