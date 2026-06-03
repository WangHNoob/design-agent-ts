import type { StreamEvent } from "./DirectorAgent.js";

/**
 * Simple synchronous event queue for collecting fine-grained execution events
 * from hooks and draining them in the DirectorAgent stream.
 */
export class EventBus {
  private queue: StreamEvent[] = [];

  /**
   * Push an event into the queue (called by hooks during execution)
   */
  emit(event: StreamEvent): void {
    this.queue.push(event);
  }

  /**
   * Drain all accumulated events and clear the queue.
   * Called by DirectorAgent after each major execution step.
   */
  drain(): StreamEvent[] {
    const events = this.queue;
    this.queue = [];
    return events;
  }

  /**
   * Check if there are any pending events
   */
  hasEvents(): boolean {
    return this.queue.length > 0;
  }
}
