/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { MainLayout } from './components/layout/MainLayout';
import { SetupLegalNoticeModal } from '@/components/common/SetupLegalNoticeModal';
import { RiskNoticeModal } from '@/components/common/RiskNoticeModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { Agents } from './pages/Agents';
import { Channels } from './pages/Channels';
import { Skills } from './pages/Skills';
import { Cron } from './pages/Cron';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { UpgradeInstalling } from './pages/UpgradeInstalling';
import { useSettingsStore } from './stores/settings';
import { useGatewayStore } from './stores/gateway';
import { useAgentPresetMigrationStore } from './stores/agent-preset-migration';
import type { PresetInstallStatusResult } from '@/types/preset-install';
import { resolvePresetInstallRedirectPath } from './lib/preset-install-guard';
import {
  RISK_NOTICE_STORAGE_KEY,
  RISK_NOTICE_VERSION,
  isRiskNoticePlatform,
  shouldShowRiskNotice,
} from '@/lib/risk-notice';
import {
  SETUP_LEGAL_NOTICE_SETTING_KEY,
  SETUP_LEGAL_NOTICE_VERSION,
  shouldShowSetupLegalNotice,
} from '@/lib/setup-legal-notice';


/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#f87171',
          background: '#0f172a',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#1e293b',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function getInitialRiskNoticeReadyState(): boolean {
  try {
    return !isRiskNoticePlatform(window.electron.platform);
  } catch {
    return true;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSetupLegalNotice, setShowSetupLegalNotice] = useState(false);
  const [setupLegalNoticeReady, setSetupLegalNoticeReady] = useState(false);
  const [showRiskNotice, setShowRiskNotice] = useState(false);
  const [riskNoticeReady, setRiskNoticeReady] = useState(getInitialRiskNoticeReadyState);
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const markSetupIncomplete = useSettingsStore((state) => state.markSetupIncomplete);
  const initGateway = useGatewayStore((state) => state.init);
  const initAgentPresetMigration = useAgentPresetMigrationStore((state) => state.init);

  // Sync i18n language with persisted settings on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);

  useEffect(() => {
    initAgentPresetMigration();
  }, [initAgentPresetMigration]);

  // Check for force-setup command line argument
  useEffect(() => {
    const checkForceSetup = async () => {
      try {
        const forceSetup = await window.electron.ipcRenderer.invoke('app:forceSetup');
        if (forceSetup) {
          markSetupIncomplete();
        }
      } catch (error) {
        console.error('Failed to check force-setup:', error);
      }
    };
    checkForceSetup();
  }, [markSetupIncomplete]);

  useEffect(() => {
    let cancelled = false;

    const ensureSetupForEmptyProviderState = async () => {
      if (!setupComplete || location.pathname.startsWith('/setup')) {
        return;
      }

      try {
        const providers = await window.electron.ipcRenderer.invoke('provider:list') as unknown[];
        if (!cancelled && Array.isArray(providers) && providers.length === 0) {
          markSetupIncomplete();
        }
      } catch (error) {
        console.error('Failed to verify provider bootstrap state:', error);
      }
    };

    void ensureSetupForEmptyProviderState();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, markSetupIncomplete, setupComplete]);

  // Redirect to setup wizard if not complete
  useEffect(() => {
    if (!setupComplete && !location.pathname.startsWith('/setup')) {
      navigate('/setup');
    }
  }, [setupComplete, location.pathname, navigate]);

  // Redirect to upgrade installer when preset install is pending after setup is complete.
  useEffect(() => {
    let cancelled = false;

    const checkPresetInstallStatus = async () => {
      if (!setupComplete || location.pathname.startsWith('/setup')) {
        return;
      }

      try {
        const status = await window.electron.ipcRenderer.invoke(
          'presetInstall:getStatus'
        ) as PresetInstallStatusResult;
        if (cancelled) {
          return;
        }

        const redirectPath = resolvePresetInstallRedirectPath({
          setupComplete,
          pathname: location.pathname,
          pending: status.pending,
        });
        if (redirectPath) {
          navigate(redirectPath);
        }
      } catch (error) {
        console.error('Failed to check preset install status:', error);
      }
    };

    void checkPresetInstallStatus();

    return () => {
      cancelled = true;
    };
  }, [setupComplete, location.pathname, navigate]);

  useEffect(() => {
    if (!setupComplete) {
      return;
    }

    const unsubscribe = window.electron.ipcRenderer.on('presetInstall:statusChanged', (rawStatus) => {
      const status = rawStatus as PresetInstallStatusResult;
      const redirectPath = resolvePresetInstallRedirectPath({
        setupComplete,
        pathname: location.pathname,
        pending: status.pending,
      });
      if (redirectPath) {
        navigate(redirectPath);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [setupComplete, location.pathname, navigate]);

  // Listen for navigation events from main process
  useEffect(() => {
    const handleNavigate = (...args: unknown[]) => {
      const path = args[0];
      if (typeof path === 'string') {
        navigate(path);
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on('navigate', handleNavigate);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const loadSetupLegalNoticeState = async () => {
      if (setupComplete) {
        if (!cancelled) {
          setShowSetupLegalNotice(false);
          setSetupLegalNoticeReady(true);
        }
        return;
      }

      if (!cancelled) {
        setSetupLegalNoticeReady(false);
      }

      try {
        const acceptedVersion = await window.electron.ipcRenderer.invoke(
          'settings:get',
          SETUP_LEGAL_NOTICE_SETTING_KEY,
        ) as string | null | undefined;

        if (!cancelled) {
          setShowSetupLegalNotice(shouldShowSetupLegalNotice(setupComplete, acceptedVersion));
          setSetupLegalNoticeReady(true);
        }
      } catch (error) {
        console.error('Failed to read setup legal notice state from settings:', error);
        if (!cancelled) {
          setShowSetupLegalNotice(true);
          setSetupLegalNoticeReady(true);
        }
      }
    };

    void loadSetupLegalNoticeState();

    return () => {
      cancelled = true;
    };
  }, [setupComplete]);

  useEffect(() => {
    let cancelled = false;

    const loadRiskNoticeState = async () => {
      const platform = window.electron.platform;
      if (!isRiskNoticePlatform(platform)) {
        if (!cancelled) {
          setShowRiskNotice(false);
          setRiskNoticeReady(true);
        }
        return;
      }

      try {
        const persistedAcceptedVersion = await window.electron.ipcRenderer.invoke(
          'settings:get',
          'riskNoticeAcceptedVersion',
        ) as string | null | undefined;

        let acceptedVersion = persistedAcceptedVersion;

        try {
          const legacyAcceptedVersion = window.localStorage.getItem(RISK_NOTICE_STORAGE_KEY);
          if (!acceptedVersion && legacyAcceptedVersion) {
            acceptedVersion = legacyAcceptedVersion;
            await window.electron.ipcRenderer.invoke(
              'settings:set',
              'riskNoticeAcceptedVersion',
              legacyAcceptedVersion,
            );
          }
          if (legacyAcceptedVersion) {
            window.localStorage.removeItem(RISK_NOTICE_STORAGE_KEY);
          }
        } catch (migrationError) {
          console.error('Failed to migrate legacy risk notice state:', migrationError);
        }

        if (!cancelled) {
          setShowRiskNotice(shouldShowRiskNotice(platform, acceptedVersion));
          setRiskNoticeReady(true);
        }
      } catch (error) {
        console.error('Failed to read risk notice state from settings:', error);
        if (!cancelled) {
          setShowRiskNotice(true);
          setRiskNoticeReady(true);
        }
      }
    };

    void loadRiskNoticeState();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetupLegalNoticeAccept = () => {
    void window.electron.ipcRenderer
      .invoke('settings:set', SETUP_LEGAL_NOTICE_SETTING_KEY, SETUP_LEGAL_NOTICE_VERSION)
      .catch((error) => {
        console.error('Failed to persist setup legal notice acceptance:', error);
      })
      .finally(() => {
        setShowSetupLegalNotice(false);
      });
  };

  const handleSetupLegalNoticeReject = () => {
    void window.electron.ipcRenderer.invoke('app:quit').catch((error) => {
      console.error('Failed to quit after setup legal notice rejection:', error);
    });
  };

  const handleRiskNoticeAccept = () => {
    void window.electron.ipcRenderer
      .invoke('settings:set', 'riskNoticeAcceptedVersion', RISK_NOTICE_VERSION)
      .catch((error) => {
        console.error('Failed to persist risk notice acceptance:', error);
      })
      .finally(() => {
        setShowRiskNotice(false);
      });
  };

  const handleRiskNoticeReject = () => {
    void window.electron.ipcRenderer.invoke('app:quit').catch((error) => {
      console.error('Failed to quit after risk notice rejection:', error);
    });
  };

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        {!setupLegalNoticeReady || !riskNoticeReady ? null : (
          <>
        <Routes>
          {/* Setup wizard (shown on first launch) */}
          <Route path="/setup/*" element={<Setup />} />
          <Route path="/upgrade-installing" element={<UpgradeInstalling />} />

          {/* Main application routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/settings/*" element={<Settings />} />
          </Route>
        </Routes>

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          style={{ zIndex: 99999 }}
        />
        {showSetupLegalNotice ? (
          <SetupLegalNoticeModal
            onAccept={handleSetupLegalNoticeAccept}
            onReject={handleSetupLegalNoticeReject}
          />
        ) : showRiskNotice ? (
          <RiskNoticeModal
            onAccept={handleRiskNoticeAccept}
            onReject={handleRiskNoticeReject}
          />
        ) : null}
          </>
        )}
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
