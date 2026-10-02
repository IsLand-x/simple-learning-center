import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Static, TSchema } from '@earendil-works/pi-ai';

export interface ToolDefinition {
  description: string;
  inputSchema: TSchema;
  execute: (params: unknown, signal?: AbortSignal) => Promise<unknown>;
}

export function defineTool<T extends TSchema>(definition: {
  description: string;
  inputSchema: T;
  execute: (params: Static<T>, signal?: AbortSignal) => Promise<unknown>;
}): ToolDefinition {
  return {
    ...definition,
    // PiAgent validates against inputSchema before invoking this adapter.
    execute: (params, signal) => definition.execute(params as Static<T>, signal),
  };
}

export function piTool(name: string, definition: ToolDefinition): AgentTool<TSchema, unknown> {
  return {
    name,
    label: name,
    description: definition.description,
    parameters: definition.inputSchema,
    async execute(_toolCallId, params, signal) {
      const result = await definition.execute(params, signal);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      return { content: [{ type: 'text', text }], details: result };
    },
  };
}
