import type { HITLFreshnessCheckResult, HITLFreshnessPort } from "../../port/hitl/HITLFreshnessPort.js";
import type { HITLCheckpoint } from "../../port/hitl/HITLRepository.js";

/** Default: always fresh. Domain checks are injected at the composition root. */
export class AlwaysFreshHITLCheck implements HITLFreshnessPort {
  async check(_checkpoint: HITLCheckpoint): Promise<HITLFreshnessCheckResult> {
    return { fresh: true };
  }
}
