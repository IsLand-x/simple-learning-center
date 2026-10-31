import type { TtsPreferences } from '../../../contracts/ai';

export interface SaveTtsRequest extends TtsPreferences {
  apiKey?: string;
}

export interface SystemInfo {
  hostname: string;
  operatingSystem: string;
  architecture: string;
  cpu: { model: string | null; logicalCores: number };
  memory: { totalBytes: number; freeBytes: number };
  nodeVersion: string;
  addresses: { name: string; address: string; family: string }[];
}

export interface OpenApiTokenStatus {
  configured: boolean;
  updatedAt: string | null;
  token?: string;
}

export interface McpTokenResponse {
  configured: boolean;
  token: string | null;
}
