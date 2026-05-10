import { clearToken, getToken } from '../auth/tokenStore';

const BASE_URL = import.meta.env.VITE_SERVER_API as string;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    // Return a never-resolving promise so callers don't process a bad response
    return new Promise(() => {});
  }

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string): Promise<T> =>
  request<T>(path, { method: 'GET' });

export const apiPost = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
