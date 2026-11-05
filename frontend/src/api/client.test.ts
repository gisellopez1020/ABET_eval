import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosRequestConfig } from 'axios';

// Sesión en cookie httpOnly: el cliente nunca envía Authorization, manda las
// cookies (withCredentials) y añade X-CSRF-Token solo en métodos que modifican datos.

type Peticion = { method: string; url: string; headers: Record<string, unknown>; withCredentials?: boolean };

async function cargarCliente(csrfDeMe: string | null = 'csrf-de-me') {
  vi.resetModules();
  vi.stubEnv('VITE_SKIP_AUTH', 'false');

  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    },
    configurable: true,
  });

  const { default: apiClient, CSRF_HEADER } = await import('./client');
  const { useAuthStore } = await import('../store/authStore');

  const peticiones: Peticion[] = [];
  apiClient.defaults.adapter = async (config: AxiosRequestConfig) => {
    const headers = JSON.parse(JSON.stringify(config.headers ?? {}));
    peticiones.push({
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      headers,
      withCredentials: config.withCredentials,
    });
    const data =
      config.url === '/auth/me'
        ? { email: 'doc@uao.edu.co', nombre: 'Doc', csrf_token: csrfDeMe }
        : { ok: true };
    return { data, status: 200, statusText: 'OK', headers: {}, config: config as never };
  };

  return { apiClient, CSRF_HEADER, useAuthStore, peticiones, storage };
}

describe('apiClient con sesión en cookie', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('envía las cookies y nunca el header Authorization', async () => {
    const { apiClient, useAuthStore, peticiones, storage } = await cargarCliente();
    storage.set('auth_token', 'jwt-viejo');
    useAuthStore.setState({ csrfToken: 'tok' });

    await apiClient.get('/cursos');
    await apiClient.post('/cursos', {});

    for (const p of peticiones) {
      expect(p.withCredentials).toBe(true);
      expect(Object.keys(p.headers).map((h) => h.toLowerCase())).not.toContain('authorization');
    }
  });

  it('añade X-CSRF-Token en POST/PUT/PATCH/DELETE y no en GET', async () => {
    const { apiClient, CSRF_HEADER, useAuthStore, peticiones } = await cargarCliente();
    useAuthStore.setState({ csrfToken: 'tok' });

    await apiClient.get('/cursos');
    await apiClient.post('/cursos', {});
    await apiClient.put('/cursos/1', {});
    await apiClient.patch('/cursos/1', {});
    await apiClient.delete('/cursos/1');

    expect(peticiones.map((p) => [p.method, p.headers[CSRF_HEADER] ?? null])).toEqual([
      ['GET', null],
      ['POST', 'tok'],
      ['PUT', 'tok'],
      ['PATCH', 'tok'],
      ['DELETE', 'tok'],
    ]);
  });

  it('sin token en memoria (tras recargar) lo pide a /auth/me una sola vez antes de modificar', async () => {
    const { apiClient, CSRF_HEADER, useAuthStore, peticiones } = await cargarCliente();

    await Promise.all([apiClient.post('/a', {}), apiClient.delete('/b')]);

    expect(peticiones.filter((p) => p.url === '/auth/me')).toHaveLength(1);
    expect(peticiones[0].url).toBe('/auth/me');
    const modificaciones = peticiones.filter((p) => p.url !== '/auth/me');
    expect(modificaciones.map((p) => p.headers[CSRF_HEADER])).toEqual(['csrf-de-me', 'csrf-de-me']);
    expect(useAuthStore.getState().csrfToken).toBe('csrf-de-me');
  });

  it('en modo SKIP_AUTH no pide /auth/me ni añade el header', async () => {
    const { apiClient, CSRF_HEADER, peticiones } = await cargarClienteSkipAuth();
    await apiClient.post('/cursos', {});
    expect(peticiones.map((p) => p.url)).toEqual(['/cursos']);
    expect(peticiones[0].headers[CSRF_HEADER]).toBeUndefined();
  });
});

// RNF-16: el backend responde 401 cuando la sesión vence (8 h sin actividad o 24 h
// desde el login). El cliente olvida al docente y vuelve a /login; no hay nada más
// que hacer en el frontend: la renovación es una cookie httpOnly que pone el backend.
describe('apiClient con la sesión vencida', () => {
  const ventanaOriginal = Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    if (ventanaOriginal) Object.defineProperty(globalThis, 'window', ventanaOriginal);
    else delete (globalThis as { window?: unknown }).window;
  });

  async function conVentanaEn(pathname: string) {
    const cliente = await cargarCliente();
    const location = { pathname, href: pathname };
    Object.defineProperty(globalThis, 'window', {
      value: { location, localStorage: globalThis.localStorage },
      configurable: true,
    });
    cliente.apiClient.defaults.adapter = async (config: AxiosRequestConfig) => {
      const error = Object.assign(new Error('Request failed with status code 401'), {
        isAxiosError: true,
        config,
        response: {
          status: 401,
          data: { detail: 'Sesión inválida o expirada; inicia sesión de nuevo' },
          headers: {},
          config,
          statusText: 'Unauthorized',
        },
      });
      throw error;
    };
    return { ...cliente, location };
  }

  it('un 401 olvida al docente y su token CSRF y redirige al login', async () => {
    const { apiClient, useAuthStore, location } = await conVentanaEn('/cursos/3');
    useAuthStore.setState({ csrfToken: 'tok' });

    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({ response: { status: 401 } });

    expect(useAuthStore.getState().csrfToken).toBeNull();
    expect(location.href).toBe('/login');
  });

  it('en /login no vuelve a redirigir (sin bucle)', async () => {
    const { apiClient, location } = await conVentanaEn('/login');
    await expect(apiClient.get('/auth/me')).rejects.toBeTruthy();
    expect(location.href).toBe('/login');
  });
});

async function cargarClienteSkipAuth() {
  vi.resetModules();
  vi.stubEnv('VITE_SKIP_AUTH', 'true');
  const { default: apiClient, CSRF_HEADER } = await import('./client');
  const peticiones: Peticion[] = [];
  apiClient.defaults.adapter = async (config: AxiosRequestConfig) => {
    peticiones.push({
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      headers: JSON.parse(JSON.stringify(config.headers ?? {})),
    });
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config: config as never };
  };
  return { apiClient, CSRF_HEADER, peticiones };
}
