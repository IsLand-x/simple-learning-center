import type {
  AuthCredentialsResponse,
  AuthSession,
  LoginRequest,
  UpdateCredentialsRequest,
} from './type';
import { apiTransport } from '../http/transport';

export class AuthApi {
  constructor(private readonly transport = apiTransport) {}

  getSession(): Promise<AuthSession> {
    return this.transport.json('/api/auth/session');
  }

  login(input: LoginRequest): Promise<AuthCredentialsResponse> {
    return this.transport.json('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async logout(): Promise<void> {
    await this.transport.request('/api/auth/logout', { method: 'POST' });
  }

  updateCredentials(input: UpdateCredentialsRequest): Promise<AuthCredentialsResponse> {
    return this.transport.json('/api/auth/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
}

export const authApi = new AuthApi();
