const JWT_KEY = 'jwt';

export const getToken = (): string | null => localStorage.getItem(JWT_KEY);

export const setToken = (token: string): void => localStorage.setItem(JWT_KEY, token);

export const clearToken = (): void => localStorage.removeItem(JWT_KEY);
