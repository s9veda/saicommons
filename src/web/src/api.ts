import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface Center {
  id: number;
  name: string;
  badge_text_color: string;
  editor_ids: string[];
  member_count: number;
}
export interface User {
  id: string;
  email: string | null;
  name: string;
  gender: string | null;
  associated_centers: number[];
  is_admin: boolean;
  editor_for: number[];
  role: 'admin' | 'editor' | 'viewer';
}
export interface UserInput {
  email?: string;
  name: string;
  gender: string | null;
  is_admin: boolean;
  associated_centers: number[];
  editor_for: number[];
}

export const GENDERS = ['Male', 'Female', 'Boy', 'Girl', 'Other'];

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) { super(message); }
}

let memoryToken: string | null = null;
const TOKEN_KEY = 'saicommons.session';
export async function loadToken(): Promise<string | null> {
  memoryToken = Platform.OS === 'web'
    ? sessionStorage.getItem('token')
    : await SecureStore.getItemAsync(TOKEN_KEY);
  return memoryToken;
}
export async function setToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) sessionStorage.setItem('token', token); else sessionStorage.removeItem('token');
  } else if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  memoryToken = token;
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!API_KEY || (Platform.OS !== 'web' && !BASE)) {
    throw new ApiError('Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_API_KEY for this app.', 0, {});
  }
  const headers: Record<string, string> = { 'x-api-key': API_KEY, 'content-type': 'application/json' };
  const token = memoryToken;
  if (token) headers.authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the server', 0, {});
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : `Request failed (${response.status})`, response.status, data);
  return data as T;
}

export const api = {
  login: (email: string) => request('/v1/login', 'POST', { email }),
  registerName: (input: { name: string; gender: string | null; associated_centers: number[]; editor_for?: number[] }) =>
    request<{ user: User; token: string }>('/v1/register-name', 'POST', input),
  verify: (email: string, otp_code: string) =>
    request<{ user: User; token: string }>('/v1/verify-otp', 'POST', { email, otp_code }),
  session: () => request<{ user: User }>('/v1/session'),
  centers: () => request<{ centers: Center[] }>('/v1/centers').then((r) => r.centers),
  saveCenter: (id: number | null, input: { name: string; badge_text_color: string; editor_ids: string[] }) =>
    request<{ center: Center }>(id ? `/v1/centers/${id}` : '/v1/centers', id ? 'PUT' : 'POST', input),
  deleteCenter: (id: number) => request(`/v1/centers/${id}`, 'DELETE'),
  users: () => request<{ users: User[] }>('/v1/admin/users').then((r) => r.users),
  saveUser: (id: string | null, input: UserInput) =>
    request<{ user: User }>(id ? `/v1/admin/users/${id}` : '/v1/admin/users', id ? 'PUT' : 'POST', input),
  deleteUser: (id: string) => request(`/v1/admin/users/${id}`, 'DELETE'),
};
