export interface AuthSession {
  authenticated: boolean;
  mode: 'local' | 'remote';
  username: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UpdateCredentialsRequest {
  password: string;
}

export interface AuthCredentialsResponse {
  username: string;
}
