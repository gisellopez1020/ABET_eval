import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('persistent app state', () => {
  beforeEach(() => {
    vi.resetModules();

    const storage = new Map<string, string>();

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      configurable: true,
    });
  });

  it('persists the selected course and restores it after refresh', async () => {
    localStorage.setItem(
      'abet-course-selection',
      JSON.stringify({ state: { selectedCourseId: 42 } })
    );

    const { useCourseStore } = await import('./courseStore');
    await useCourseStore.persist.rehydrate();

    expect(useCourseStore.getState().selectedCourseId).toBe(42);
  });

  it('persists the sidebar collapsed state and restores it after refresh', async () => {
    localStorage.setItem(
      'abet-layout-state',
      JSON.stringify({ state: { sidebarCollapsed: true } })
    );

    const { useLayoutStore } = await import('./layoutStore');
    await useLayoutStore.persist.rehydrate();

    expect(useLayoutStore.getState().sidebarCollapsed).toBe(true);
  });
});
