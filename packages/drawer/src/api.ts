import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { User, AuthConfig } from './types';

export type { User } from './types';

export interface Center {
  id: number;
  name: string;
  badge_text_color: string;
  editor_ids: string[];
  member_count: number;
}

export interface UserInput {
  email?: string | null;
  revoke_sessions?: boolean;
  name: string;
  gender: string | null;
  is_admin: boolean;
  associated_centers: number[];
  editor_for: number[];
}

export const GENDERS = ['Male', 'Female', 'Boy', 'Girl', 'Other'];

export interface LoginResult {
  user: User;
  token: string;
}

export interface LoginRequestResult {
  ok: boolean;
  message: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) {
    super(message);
  }
}

let memoryToken: string | null = null;
const TOKEN_KEY = 'saicommons.session';

/** Load token from secure storage */
export async function loadToken(): Promise<string | null> {
  memoryToken = Platform.OS === 'web'
    ? sessionStorage.getItem('token')
    : await SecureStore.getItemAsync(TOKEN_KEY);
  return memoryToken;
}

/** Save or clear token */
export async function setToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) sessionStorage.setItem('token', token);
    else sessionStorage.removeItem('token');
  } else if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  memoryToken = token;
}

/** Get current token */
export function getToken(): string | null {
  return memoryToken;
}

/** Generic request function - requires base URL and API key to be configured */
export interface RequestConfig {
  baseUrl: string;
  apiKey: string;
}

let requestConfig: RequestConfig | null = null;

/** Configure the API client */
export function configureApi(config: RequestConfig): void {
  requestConfig = config;
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!requestConfig) {
    throw new ApiError('API not configured. Call configureApi() with baseUrl and apiKey.', 0, {});
  }
  const { baseUrl, apiKey } = requestConfig;
  if (!apiKey || (Platform.OS !== 'web' && !baseUrl)) {
    throw new ApiError('API configuration requires an API key and, on native platforms, a base URL.', 0, {});
  }
  
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'content-type': 'application/json',
  };
  const token = memoryToken;
  if (token) headers.authorization = `Bearer ${token}`;
  
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      Platform.OS === 'web'
        ? 'Cannot reach the server. Check the API URL and browser CORS settings.'
        : 'Cannot reach the server. Check the API URL and network connection.',
      0,
      {}
    );
  }
  
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiError('Server returned an invalid JSON response', response.status, {});
  }
  if (response.ok && (!payload || typeof payload !== 'object' || Array.isArray(payload))) {
    throw new ApiError('Server returned an invalid JSON response', response.status, {});
  }
  const data = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  if (!response.ok) {
    throw new ApiError(
      typeof data.error === 'string' ? data.error : `Request failed (${response.status})`,
      response.status,
      data
    );
  }
  return data as T;
}

/** Login with email */
export async function login(email: string, config?: AuthConfig): Promise<LoginRequestResult> {
  const endpoint = config?.loginEndpoint ?? '/v1/login';
  return request<LoginRequestResult>(endpoint, 'POST', { email });
}

/** Verify OTP code */
export async function verifyOtp(email: string, otpCode: string, config?: AuthConfig): Promise<LoginResult> {
  const endpoint = config?.verifyEndpoint ?? '/v1/verify-otp';
  return request<LoginResult>(endpoint, 'POST', { email, otp_code: otpCode });
}

/** Get current session */
export async function getSession(): Promise<{ user: User }> {
  return request<{ user: User }>('/v1/session');
}

/** API object for backward compatibility */
export const api = {
  login,
  verifyOtp,
  getSession,
  centers: () => request<{ centers: Center[] }>('/v1/centers').then((result) => result.centers),
  saveCenter: (id: number | null, input: { name: string; badge_text_color: string; editor_ids: string[] }) =>
    request<{ center: Center }>(id === null ? '/v1/centers' : `/v1/centers/${id}`, id === null ? 'POST' : 'PUT', input),
  deleteCenter: (id: number) => request(`/v1/centers/${id}`, 'DELETE'),
  users: () => request<{ users: User[] }>('/v1/admin/users').then((result) => result.users),
  saveUser: (id: string | null, input: UserInput) =>
    request<{ user: User }>(
      id === null ? '/v1/admin/users' : `/v1/admin/users/${id}`,
      id === null ? 'POST' : 'PUT',
      id === null ? input : { ...input, email: input.email ?? null, revoke_sessions: input.revoke_sessions ?? false },
    ),
  deleteUser: (id: string) => request(`/v1/admin/users/${id}`, 'DELETE'),
};