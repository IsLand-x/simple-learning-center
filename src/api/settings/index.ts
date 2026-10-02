import type {
  BilibiliCredentialStatus,
  McpTokenResponse,
  OAuthOperation,
  OAuthProviderId,
  OAuthProviderStatus,
  OpenApiTokenStatus,
  SaveBilibiliCookieRequest,
  SystemInfo,
} from './type';
import { apiTransport } from '../http/transport';

class SettingsApi {
  constructor(private readonly transport = apiTransport) {}

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

  getOAuthProviders(signal?: AbortSignal): Promise<OAuthProviderStatus[]> {
    return this.transport.json('/api/ai/oauth/providers', { signal });
  }

  operateOAuthProvider(
    id: OAuthProviderId,
    operation: OAuthOperation,
  ): Promise<OAuthProviderStatus> {
    return this.transport.json(`/api/ai/oauth/${id}${operation === 'logout' ? '' : '/login'}`, {
      method: operation === 'login' ? 'POST' : 'DELETE',
      headers: { 'X-Learning-Center-OAuth': '1' },
    });
  }

  getBilibiliCredentialStatus(): Promise<BilibiliCredentialStatus> {
    return this.transport.json('/api/source-credentials/bilibili');
  }

  saveBilibiliCookie(input: SaveBilibiliCookieRequest): Promise<BilibiliCredentialStatus> {
    return this.transport.json('/api/source-credentials/bilibili', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  verifySavedBilibiliCookie(): Promise<BilibiliCredentialStatus> {
    return this.transport.json('/api/source-credentials/bilibili/verify', { method: 'POST' });
  }

  deleteSavedBilibiliCookie(): Promise<BilibiliCredentialStatus> {
    return this.transport.json('/api/source-credentials/bilibili', { method: 'DELETE' });
  }
}

export const settingsApi = new SettingsApi();
