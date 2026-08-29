import { serverRequest } from './serverApi';

export interface AuthSession {
  authenticated: boolean;
  mode: 'local' | 'remote';
  username: string | null;
}

export interface CaptchaChallenge {
  id: string;
  image: string;
}

export async function getAuthSession() {
  const response = await serverRequest('/api/auth/session');
  return response.json() as Promise<AuthSession>;
}

export async function getCaptcha() {
  const response = await serverRequest('/api/auth/captcha');
  return response.json() as Promise<CaptchaChallenge>;
}

export async function login(username: string, password: string, captchaId: string, captcha: string) {
  const response = await serverRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, captchaId, captcha }),
  });
  return response.json() as Promise<{ username: string }>;
}

export async function logout() {
  await serverRequest('/api/auth/logout', { method: 'POST' });
}

export async function updateCredentials(input: {
  currentPassword: string;
  username: string;
  password: string;
}) {
  const response = await serverRequest('/api/auth/credentials', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json() as Promise<{ username: string }>;
}
