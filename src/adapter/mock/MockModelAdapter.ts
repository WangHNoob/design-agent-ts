import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { ModelOptions } from "../../port/model/ModelOptions.js";
import type { ModelResponse } from "../../port/model/ModelResponse.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";

export class MockModelAdapter implements ChatModelPort {
  private presetResponses: ChatMessage[];
  private responseIndex = 0;

  constructor(responses?: ChatMessage[]) {
    this.presetResponses = responses ?? [
      CM.text(
        "assistant",
        "mock",
        JSON.stringify({
          planId: "mock-plan",
          subTasks: [
            {
              id: "T1",
              fragmentId: "F1",
              domain: "system_design",
              description: "Mock loadtest task",
              dependencies: [],
              priority: 1,
            },
          ],
        }),
      ),
      CM.text(
        "assistant",
        "mock",
        JSON.stringify([
          {
            fragmentId: "F1",
            domain: "system_design",
            agentName: "SystemDesigner",
            assignment: "Mock loadtest assignment",
            priority: 1,
          },
        ]),
      ),
    ];
  }

  async generate(_messages: ChatMessage[], _options?: ModelOptions): Promise<ModelResponse> {
    const msg = this.presetResponses[this.responseIndex % this.presetResponses.length]!;
    this.responseIndex++;
    return {
      message: msg,
      inputTokenCount: 0,
      outputTokenCount: 0,
      finishReason: "stop",
    };
  }

  async *stream(_messages: ChatMessage[], _options?: ModelOptions): AsyncIterable<ModelResponse> {
    const msg = this.presetResponses[this.responseIndex % this.presetResponses.length]!;
    this.responseIndex++;
    yield {
      message: msg,
      inputTokenCount: 0,
      outputTokenCount: 0,
      finishReason: "stop",
    };
  }

  getModelName(): string {
    return "mock-model";
  }

  getProvider(): string {
    return "mock";
  }
}
