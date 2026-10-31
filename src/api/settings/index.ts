import type { McpTokenResponse, OpenApiTokenStatus, SystemInfo } from './type';
import { apiTransport } from '../http/transport';
import type { TtsStatus } from '../../../contracts/ai';
import type { SaveTtsRequest } from './type';

class SettingsApi {
  constructor(private readonly transport = apiTransport) {}

  getTts(signal?: AbortSignal): Promise<TtsStatus> {
    return this.transport.json('/api/settings/tts', { signal });
  }
  saveTts(input: SaveTtsRequest): Promise<TtsStatus> {
    return this.transport.json('/api/settings/tts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
  removeTts(): Promise<TtsStatus> {
    return this.transport.json('/api/settings/tts', { method: 'DELETE' });
  }
  async testTts(signal: AbortSignal): Promise<Blob> {
    return (
      await this.transport.request('/api/settings/tts/test', { method: 'POST', signal })
    ).blob();
  }

  getSystemInfo(signal: AbortSignal): Promise<SystemInfo> {
    return this.transport.json('/api/settings/system-info', { signal });
  }

  private requestOpenApiToken(
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
  ): Promise<OpenApiTokenStatus> {
    return this.transport.json('/api/settings/openapi-token', {
      method,
      headers: { 'X-Learning-Center-Request': '1' },
    });
  }

  getOpenApiToken(): Promise<OpenApiTokenStatus> {
    return this.requestOpenApiToken('GET');
  }

  generateOpenApiToken(): Promise<OpenApiTokenStatus> {
    return this.requestOpenApiToken('POST');
  }

  revokeOpenApiToken(): Promise<OpenApiTokenStatus> {
    return this.requestOpenApiToken('DELETE');
  }

  readMcpToken(): Promise<McpTokenResponse> {
    return this.transport.json('/api/settings/openapi-token/mcp');
  }
}

export const settingsApi = new SettingsApi();
