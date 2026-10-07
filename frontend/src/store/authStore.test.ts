import { beforeEach, describe, expect, it, vi } from 'vitest';

// La sesión vive en una cookie httpOnly: el store solo persiste el docente
// (para no parpadear al recargar) y guarda el token CSRF en memoria.

let storage: Map<string, string>;

async function cargarStore() {
  vi.resetModules();
  vi.stubEnv('VITE_SKIP_AUTH', 'false');
  const { useAuthStore } = await import('./authStore');
  return useAuthStore;
}

describe('authStore', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
        clear: () => storage.clear(),
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: globalThis.localStorage },
      configurable: true,
    });
  });

  it('setSesion persiste solo el docente; el token CSRF queda en memoria', async () => {
    const store = await cargarStore();
    store.getState().setSesion({ email: 'doc@uao.edu.co', nombre: 'Doc', csrf_token: 'tok' });

    expect(store.getState().csrfToken).toBe('tok');
    expect([...storage.keys()]).toEqual(['auth_user']);
    expect(JSON.parse(storage.get('auth_user')!)).toEqual({ email: 'doc@uao.edu.co', nombre: 'Doc' });
    expect([...storage.values()].join()).not.toContain('tok');
  });

  it('al recargar recupera el docente pero no el token CSRF', async () => {
    storage.set('auth_user', JSON.stringify({ email: 'doc@uao.edu.co', nombre: 'Doc' }));
    const store = await cargarStore();
    expect(store.getState().user?.email).toBe('doc@uao.edu.co');
    expect(store.getState().csrfToken).toBeNull();
    expect(store.getState().isAuthenticated()).toBe(true);
  });

  it('borra el JWT que la versión anterior dejaba en localStorage', async () => {
    storage.set('auth_token', 'jwt-viejo');
    await cargarStore();
    expect(storage.has('auth_token')).toBe(false);
  });

  it('clearAuth olvida al docente y el token', async () => {
    const store = await cargarStore();
    store.getState().setSesion({ email: 'doc@uao.edu.co', nombre: 'Doc', csrf_token: 'tok' });
    store.getState().clearAuth();
    expect(store.getState().user).toBeNull();
    expect(store.getState().csrfToken).toBeNull();
    expect(store.getState().isAuthenticated()).toBe(false);
    expect(storage.size).toBe(0);
  });
});
