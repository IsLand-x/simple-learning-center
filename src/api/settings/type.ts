import type { OpenAICompatibleConfig } from '../../../contracts/ai';
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

export type OAuthProviderId = NonNullable<OpenAICompatibleConfig['oauthProvider']>;

export interface OAuthProviderStatus {
  id: OAuthProviderId;
  connected: boolean;
  models: string[];
  login: null | {
    state: 'pending' | 'completed' | 'failed';
    userCode?: string;
    url?: string;
    message?: string;
  };
}

export type OAuthOperation = 'login' | 'cancel' | 'logout';
