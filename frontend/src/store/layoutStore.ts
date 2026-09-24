import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LayoutState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

const storage = createJSONStorage(() => ({
  getItem: (name: string) => {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return null;
    }

    return globalThis.localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    globalThis.localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    globalThis.localStorage.removeItem(name);
  },
}));

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: 'abet-layout-state',
      storage,
    }
  )
);
