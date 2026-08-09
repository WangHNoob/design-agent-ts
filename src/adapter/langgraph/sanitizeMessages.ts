import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";

/**
 * OpenAI-compatible providers reject message lists where a `tool` message is
 * not preceded by an assistant message whose tool_calls include a matching id
 * (400 INVALID_TOOL_RESULTS — seen in production after context compression
 * evicted the assistant turn but kept its ToolMessages).
 *
 * This guard demotes dangling tool results to plain text so a broken pair
 * degrades to "one lost tool result" instead of failing the whole LLM call.
 */
export function sanitizeToolSequence(msgs: BaseMessage[]): BaseMessage[] {
  const out: BaseMessage[] = [];
  let pendingCallIds = new Set<string>();

  for (const m of msgs) {
    if (m instanceof AIMessage) {
      const toolCalls = (m as AIMessage).tool_calls ?? [];
      pendingCallIds = new Set(
        toolCalls.map((tc) => tc.id).filter((id): id is string => Boolean(id)),
      );
      out.push(m);
      continue;
    }

    if (m instanceof ToolMessage) {
      const callId = (m as ToolMessage).tool_call_id ?? "";
      if (callId && pendingCallIds.has(callId)) {
        out.push(m);
      } else {
        const content =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        out.push(
          new HumanMessage({
            content: `[工具结果] ${content}`,
            name: m.name ?? undefined,
          }),
        );
      }
      continue;
    }

    out.push(m);
  }

  return out;
}
