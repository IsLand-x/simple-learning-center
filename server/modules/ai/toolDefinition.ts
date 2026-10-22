import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ImageContent, Static, TextContent, TSchema } from '@earendil-works/pi-ai';

type ModelContent = (TextContent | ImageContent)[];

export interface ToolDefinition {
  description: string;
  inputSchema: TSchema;
  execute: (params: unknown, signal?: AbortSignal) => Promise<unknown>;
  modelContent?: (result: unknown) => ModelContent;
}

export function defineTool<T extends TSchema, R>(definition: {
  description: string;
  inputSchema: T;
  execute: (params: Static<T>, signal?: AbortSignal) => Promise<R>;
  modelContent?: (result: R) => ModelContent;
}): ToolDefinition {
  return {
    ...definition,
    // PiAgent validates against inputSchema before invoking this adapter.
    execute: (params, signal) => definition.execute(params as Static<T>, signal),
    modelContent: definition.modelContent
      ? (result) => definition.modelContent!(result as R)
      : undefined,
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
      return {
        content: definition.modelContent?.(result) ?? [{ type: 'text', text }],
        details: result,
      };
    },
  };
}
