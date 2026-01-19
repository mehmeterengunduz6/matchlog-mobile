import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'matchlog.sessionToken.v1';
const DEFAULT_DEV_BASE_URL = 'http://localhost:3000/api';
const DEFAULT_PROD_BASE_URL = 'https://matchlog-eta.vercel.app/api';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (__DEV__ ? DEFAULT_DEV_BASE_URL : DEFAULT_PROD_BASE_URL);

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export async function getSessionToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setSessionToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearSessionToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function requestJson(
  path: string,
  options: RequestInit = {},
  includeAuth: boolean
) {
  const headers = new Headers(options.headers ?? {});
  headers.set('Content-Type', 'application/json');
  if (includeAuth) {
    const token = await getSessionToken();
    if (!token) {
      throw new AuthError();
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    throw new AuthError();
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Request failed: ${res.status}`);
  }

  return res.json();
}

export function fetchJson(path: string, options?: RequestInit) {
  return requestJson(path, options, true);
}

export function fetchPublicJson(path: string, options?: RequestInit) {
  return requestJson(path, options, false);
}
