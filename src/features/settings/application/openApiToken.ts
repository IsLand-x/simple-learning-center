import { serverRequest } from '../../../lib/serverApi';

export interface OpenApiTokenStatus {
  configured: boolean;
  updatedAt: string | null;
  token?: string;
}

export async function requestOpenApiToken(method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  const response = await serverRequest('/api/settings/openapi-token', {
    method,
    headers: { 'X-Learning-Center-Request': '1' },
  });
  return response.json() as Promise<OpenApiTokenStatus>;
}
