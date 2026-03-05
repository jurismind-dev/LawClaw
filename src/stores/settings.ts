/**
 * Settings State Store
 * Manages application settings
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';

type Theme = 'light' | 'dark' | 'system';
type UpdateChannel = 'stable' | 'beta' | 'dev';

interface SettingsState {
  // General
  theme: Theme;
  language: string;
  startMinimized: boolean;
  launchAtStartup: boolean;

  // Gateway
  gatewayAutoStart: boolean;
  gatewayPort: number;

  // Update
  updateChannel: UpdateChannel;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;

  // UI State
  sidebarCollapsed: boolean;
  devModeUnlocked: boolean;

  // Setup
  setupComplete: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setLanguage: (language: string) => void;
  setStartMinimized: (value: boolean) => void;
  setLaunchAtStartup: (value: boolean) => void;
  setGatewayAutoStart: (value: boolean) => void;
  setGatewayPort: (port: number) => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  setAutoCheckUpdate: (value: boolean) => void;
  setAutoDownloadUpdate: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  setDevModeUnlocked: (value: boolean) => void;
  markSetupComplete: () => void;
  markSetupIncomplete: () => void;
  resetSettings: () => void;
}

function normalizeLanguage(input: unknown): string {
  const language = String(input || '').toLowerCase();
  if (language.startsWith('zh')) return 'zh';
  return 'en';
}

const defaultSettings = {
  theme: 'system' as Theme,
  language: normalizeLanguage(navigator.language),
  startMinimized: false,
  launchAtStartup: false,
  gatewayAutoStart: true,
  gatewayPort: 18789,
  updateChannel: 'stable' as UpdateChannel,
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  sidebarCollapsed: false,
  devModeUnlocked: false,
  setupComplete: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => {
        const normalized = normalizeLanguage(language);
        i18n.changeLanguage(normalized);
        set({ language: normalized });
      },
      setStartMinimized: (startMinimized) => set({ startMinimized }),
      setLaunchAtStartup: (launchAtStartup) => set({ launchAtStartup }),
      setGatewayAutoStart: (gatewayAutoStart) => set({ gatewayAutoStart }),
      setGatewayPort: (gatewayPort) => set({ gatewayPort }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
      setAutoCheckUpdate: (autoCheckUpdate) => set({ autoCheckUpdate }),
      setAutoDownloadUpdate: (autoDownloadUpdate) => set({ autoDownloadUpdate }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setDevModeUnlocked: (devModeUnlocked) => set({ devModeUnlocked }),
      markSetupComplete: () => set({ setupComplete: true }),
      markSetupIncomplete: () => set({ setupComplete: false }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'clawx-settings',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Partial<SettingsState>;
        return {
          ...currentState,
          ...persisted,
          language: normalizeLanguage(persisted.language ?? currentState.language),
        };
      },
    }
  )
);
