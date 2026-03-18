/**
 * Setup Wizard Page
 * First-time setup experience for new users
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  X,
  QrCode,
  ExternalLink,
  BookOpen,
  Copy,
} from 'lucide-react';
import { TitleBar } from '@/components/layout/TitleBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { FeishuOfficialOnboardingPanel } from '@/components/channels/FeishuOfficialOnboardingPanel';
import { cn } from '@/lib/utils';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { toast } from 'sonner';
import {
  CHANNEL_META,
  getPrimaryChannels,
  type ChannelType,
  type ChannelMeta,
  type ChannelConfigField,
} from '@/types/channel';
import { shouldAutoSelectLawClawProvider } from '@/lib/lawclaw-provider-ui-context';
import type {
  PresetInstallProgressEvent,
  PresetInstallRunResult,
  PresetInstallStatusResult,
} from '@/types/preset-install';

interface SetupStep {
  id: string;
  title: string;
  description: string;
}

const STEP = {
  WELCOME: 0,
  RUNTIME: 1,
  PROVIDER: 2,
  CHANNEL: 3,
  INSTALLING: 4,
  COMPLETE: 5,
} as const;

const steps: SetupStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to LawClaw',
    description: 'Your AI assistant is ready to be configured',
  },
  {
    id: 'runtime',
    title: 'Environment Check',
    description: 'Verifying system requirements',
  },
  {
    id: 'provider',
    title: 'AI Provider',
    description: 'Configure your AI service',
  },
  {
    id: 'channel',
    title: 'Connect a Channel',
    description: 'Connect a messaging platform (optional)',
  },
  {
    id: 'installing',
    title: 'Setting Up',
    description: 'Installing essential components',
  },
  {
    id: 'complete',
    title: 'All Set!',
    description: 'LawClaw is ready to use',
  },
];

import { SETUP_PROVIDERS, type ProviderTypeInfo, getProviderIconUrl, shouldInvertInDark } from '@/lib/providers';
import clawxIcon from '@/assets/logo.svg';

// Use the shared provider registry for setup providers
const providers = SETUP_PROVIDERS;

// NOTE: Channel types moved to Settings > Channels page
// NOTE: Skill bundles moved to Settings > Skills page - auto-install essential skills during setup

export function Setup() {
  const { t } = useTranslation(['setup', 'channels']);
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(STEP.WELCOME);

  // Setup state
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  // Installation state for the Installing step
  const [installedSkills, setInstalledSkills] = useState<string[]>([]);
  // Runtime check status
  const [runtimeChecksPassed, setRuntimeChecksPassed] = useState(false);

  const safeStepIndex = Number.isInteger(currentStep)
    ? Math.min(Math.max(currentStep, STEP.WELCOME), steps.length - 1)
    : STEP.WELCOME;
  const step = steps[safeStepIndex] ?? steps[STEP.WELCOME];
  const isFirstStep = safeStepIndex === STEP.WELCOME;
  const isLastStep = safeStepIndex === steps.length - 1;

  const markSetupComplete = useSettingsStore((state) => state.markSetupComplete);

  // Derive canProceed based on current step - computed directly to avoid useEffect
  const canProceed = useMemo(() => {
    switch (safeStepIndex) {
      case STEP.WELCOME:
        return true;
      case STEP.RUNTIME:
        return runtimeChecksPassed;
      case STEP.PROVIDER:
        return providerConfigured;
      case STEP.CHANNEL:
        return true; // Always allow proceeding — channel step is optional
      case STEP.INSTALLING:
        return false; // Cannot manually proceed, auto-proceeds when done
      case STEP.COMPLETE:
        return true;
      default:
        return true;
    }
  }, [safeStepIndex, providerConfigured, runtimeChecksPassed]);

  const handleNext = async () => {
    if (isLastStep) {
      // Complete setup
      markSetupComplete();
      toast.success(t('complete.title'));
      navigate('/');
    } else {
      setCurrentStep((i) => i + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((i) => Math.max(i - 1, 0));
  };

  // Auto-proceed when installation is complete
  const handleInstallationComplete = useCallback((skills: string[]) => {
    setInstalledSkills(skills);
    // Auto-proceed to next step after a short delay
    setTimeout(() => {
      setCurrentStep((i) => i + 1);
    }, 1000);
  }, []);


  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex-1 overflow-auto">
        {/* Progress Indicator */}
        <div className="flex justify-center pt-8">
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                    i < safeStepIndex
                      ? 'border-primary bg-primary text-primary-foreground'
                      : i === safeStepIndex
                        ? 'border-primary text-primary'
                        : 'border-slate-600 text-slate-600'
                  )}
                >
                  {i < safeStepIndex ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-sm">{i + 1}</span>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-8 transition-colors',
                      i < safeStepIndex ? 'bg-primary' : 'bg-slate-600'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-auto max-w-2xl p-8"
          >
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">{t(`steps.${step.id}.title`)}</h1>
              <p className="text-slate-400">{t(`steps.${step.id}.description`)}</p>
            </div>

            {/* Step-specific content */}
            <div className="rounded-xl bg-card text-card-foreground border shadow-sm p-8 mb-8">
              {safeStepIndex === STEP.WELCOME && <WelcomeContent />}
              {safeStepIndex === STEP.RUNTIME && <RuntimeContent onStatusChange={setRuntimeChecksPassed} />}
              {safeStepIndex === STEP.PROVIDER && (
                <ProviderContent
                  providers={providers}
                  selectedProvider={selectedProvider}
                  onSelectProvider={setSelectedProvider}
                  apiKey={apiKey}
                  onApiKeyChange={setApiKey}
                  onConfiguredChange={setProviderConfigured}
                />
              )}
              {safeStepIndex === STEP.CHANNEL && (
                <SetupChannelContent />
              )}
              {safeStepIndex === STEP.INSTALLING && (
                <InstallingContent onComplete={handleInstallationComplete} />
              )}
              {safeStepIndex === STEP.COMPLETE && (
                <CompleteContent
                  selectedProvider={selectedProvider}
                  installedSkills={installedSkills}
                />
              )}
            </div>

            {/* Navigation - hidden during installation step */}
            {safeStepIndex !== STEP.INSTALLING && (
              <div className="flex justify-between">
                <div>
                  {!isFirstStep && (
                    <Button variant="ghost" onClick={handleBack}>
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      {t('nav.back')}
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleNext} disabled={!canProceed}>
                    {isLastStep ? (
                      t('nav.getStarted')
                    ) : (
                      <>
                        {t('nav.next')}
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ==================== Step Content Components ====================

function WelcomeContent() {
  const { t } = useTranslation(['setup', 'settings']);
  const { language, setLanguage } = useSettingsStore();

  return (
    <div className="text-center space-y-4">
      <div className="mb-4 flex justify-center">
        <img src={clawxIcon} alt="LawClaw" className="h-16 w-16" />
      </div>
      <h2 className="text-xl font-semibold">{t('welcome.title')}</h2>
      <p className="text-muted-foreground">
        {t('welcome.description')}
      </p>

      {/* Language Selector */}
      <div className="flex justify-center gap-2 py-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Button
            key={lang.code}
            variant={language === lang.code ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setLanguage(lang.code)}
            className="h-7 text-xs"
          >
            {lang.label}
          </Button>
        ))}
      </div>

      <ul className="text-left space-y-2 text-muted-foreground pt-2">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          {t('welcome.features.noCommand')}
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          {t('welcome.features.modernUI')}
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          {t('welcome.features.bundles')}
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          {t('welcome.features.crossPlatform')}
        </li>
      </ul>
    </div>
  );
}

interface RuntimeContentProps {
  onStatusChange: (canProceed: boolean) => void;
}

function RuntimeContent({ onStatusChange }: RuntimeContentProps) {
  const { t } = useTranslation('setup');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const startGateway = useGatewayStore((state) => state.start);

  const [checks, setChecks] = useState({
    nodejs: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
    openclaw: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
    gateway: { status: 'checking' as 'checking' | 'success' | 'error', message: '' },
  });
  const [showLogs, setShowLogs] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [openclawDir, setOpenclawDir] = useState('');
  const gatewayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const runChecks = useCallback(async () => {
    // Reset checks
    setChecks({
      nodejs: { status: 'checking', message: '' },
      openclaw: { status: 'checking', message: '' },
      gateway: { status: 'checking', message: '' },
    });

    // Check Node.js — always available in Electron
    setChecks((prev) => ({
      ...prev,
      nodejs: { status: 'success', message: t('runtime.status.success') },
    }));

    // Check OpenClaw package status
    try {
      const openclawStatus = await window.electron.ipcRenderer.invoke('openclaw:status') as {
        packageExists: boolean;
        isBuilt: boolean;
        dir: string;
        version?: string;
      };

      setOpenclawDir(openclawStatus.dir);

      if (!openclawStatus.packageExists) {
        setChecks((prev) => ({
          ...prev,
          openclaw: {
            status: 'error',
            message: `OpenClaw package not found at: ${openclawStatus.dir}`
          },
        }));
      } else if (!openclawStatus.isBuilt) {
        setChecks((prev) => ({
          ...prev,
          openclaw: {
            status: 'error',
            message: 'OpenClaw package found but dist is missing'
          },
        }));
      } else {
        const versionLabel = openclawStatus.version ? ` v${openclawStatus.version}` : '';
        setChecks((prev) => ({
          ...prev,
          openclaw: {
            status: 'success',
            message: `OpenClaw package ready${versionLabel}`
          },
        }));
      }
    } catch (error) {
      setChecks((prev) => ({
        ...prev,
        openclaw: { status: 'error', message: `Check failed: ${error}` },
      }));
    }

    // Check Gateway — read directly from store to avoid stale closure
    // Don't immediately report error; gateway may still be initializing
    const currentGateway = useGatewayStore.getState().status;
    if (currentGateway.state === 'running') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'success', message: `Running on port ${currentGateway.port}` },
      }));
    } else if (currentGateway.state === 'error') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'error', message: currentGateway.error || t('runtime.status.error') },
      }));
    } else {
      // Gateway is 'stopped', 'starting', or 'reconnecting'
      // Keep as 'checking' — the dedicated useEffect will update when status changes
      setChecks((prev) => ({
        ...prev,
        gateway: {
          status: 'checking',
          message: currentGateway.state === 'starting' ? t('runtime.status.checking') : 'Waiting for gateway...'
        },
      }));
    }
  }, [t]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Update canProceed when gateway status changes
  useEffect(() => {
    const allPassed = checks.nodejs.status === 'success'
      && checks.openclaw.status === 'success'
      && (checks.gateway.status === 'success' || gatewayStatus.state === 'running');
    onStatusChange(allPassed);
  }, [checks, gatewayStatus, onStatusChange]);

  // Update gateway check when gateway status changes
  useEffect(() => {
    if (gatewayStatus.state === 'running') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'success', message: t('runtime.status.gatewayRunning', { port: gatewayStatus.port }) },
      }));
    } else if (gatewayStatus.state === 'error') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'error', message: gatewayStatus.error || 'Failed to start' },
      }));
    } else if (gatewayStatus.state === 'starting' || gatewayStatus.state === 'reconnecting') {
      setChecks((prev) => ({
        ...prev,
        gateway: { status: 'checking', message: 'Starting...' },
      }));
    }
    // 'stopped' state: keep current check status (likely 'checking') to allow startup time
  }, [gatewayStatus, t]);

  // Gateway startup timeout — show error only after giving enough time to initialize
  useEffect(() => {
    if (gatewayTimeoutRef.current) {
      clearTimeout(gatewayTimeoutRef.current);
      gatewayTimeoutRef.current = null;
    }

    // If gateway is already in a terminal state, no timeout needed
    if (gatewayStatus.state === 'running' || gatewayStatus.state === 'error') {
      return;
    }

    // Set timeout for non-terminal states (stopped, starting, reconnecting)
    gatewayTimeoutRef.current = setTimeout(() => {
      setChecks((prev) => {
        if (prev.gateway.status === 'checking') {
          return {
            ...prev,
            gateway: { status: 'error', message: 'Gateway startup timed out' },
          };
        }
        return prev;
      });
    }, 600 * 1000); // 600 seconds — enough for gateway to fully initialize

    return () => {
      if (gatewayTimeoutRef.current) {
        clearTimeout(gatewayTimeoutRef.current);
        gatewayTimeoutRef.current = null;
      }
    };
  }, [gatewayStatus.state]);

  const handleStartGateway = async () => {
    setChecks((prev) => ({
      ...prev,
      gateway: { status: 'checking', message: 'Starting...' },
    }));
    await startGateway();
  };

  const handleShowLogs = async () => {
    try {
      const logs = await window.electron.ipcRenderer.invoke('log:readFile', 100) as string;
      setLogContent(logs);
      setShowLogs(true);
    } catch {
      setLogContent('(Failed to load logs)');
      setShowLogs(true);
    }
  };

  const handleOpenLogDir = async () => {
    try {
      const logDir = await window.electron.ipcRenderer.invoke('log:getDir') as string;
      if (logDir) {
        await window.electron.ipcRenderer.invoke('shell:showItemInFolder', logDir);
      }
    } catch {
      // ignore
    }
  };

  const ERROR_TRUNCATE_LEN = 30;

  const renderStatus = (status: 'checking' | 'success' | 'error', message: string) => {
    if (status === 'checking') {
      return (
        <span className="flex items-center gap-2 text-yellow-400 whitespace-nowrap">
          <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" />
          {message || 'Checking...'}
        </span>
      );
    }
    if (status === 'success') {
      return (
        <span className="flex items-center gap-2 text-green-400 whitespace-nowrap">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          {message}
        </span>
      );
    }

    const isLong = message.length > ERROR_TRUNCATE_LEN;
    const displayMsg = isLong ? message.slice(0, ERROR_TRUNCATE_LEN) : message;

    return (
      <span className="flex items-center gap-2 text-red-400 whitespace-nowrap">
        <XCircle className="h-5 w-5 flex-shrink-0" />
        <span>{displayMsg}</span>
        {isLong && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer text-red-300 hover:text-red-200 font-medium">...</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm whitespace-normal break-words text-xs">
              {message}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t('runtime.title')}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleShowLogs}>
            {t('runtime.viewLogs')}
          </Button>
          <Button variant="ghost" size="sm" onClick={runChecks}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('runtime.recheck')}
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-3 rounded-lg bg-muted/50">
          <span className="text-left">{t('runtime.nodejs')}</span>
          <div className="flex justify-end">
            {renderStatus(checks.nodejs.status, checks.nodejs.message)}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-3 rounded-lg bg-muted/50">
          <div className="text-left min-w-0">
            <span>{t('runtime.openclaw')}</span>
            {openclawDir && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">
                {openclawDir}
              </p>
            )}
          </div>
          <div className="flex justify-end self-start mt-0.5">
            {renderStatus(checks.openclaw.status, checks.openclaw.message)}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-left">
            <span>Gateway Service</span>
            {checks.gateway.status === 'error' && (
              <Button variant="outline" size="sm" onClick={handleStartGateway}>
                Start Gateway
              </Button>
            )}
          </div>
          <div className="flex justify-end">
            {renderStatus(checks.gateway.status, checks.gateway.message)}
          </div>
        </div>
      </div>

      {(checks.nodejs.status === 'error' || checks.openclaw.status === 'error') && (
        <div className="mt-4 p-4 rounded-lg bg-red-900/20 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
            <div>
              <p className="font-medium text-red-400">{t('runtime.issue.title')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('runtime.issue.desc')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Log viewer panel */}
      {showLogs && (
        <div className="mt-4 p-4 rounded-lg bg-black/40 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-foreground text-sm">Application Logs</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleOpenLogDir}>
                <ExternalLink className="h-3 w-3 mr-1" />
                Open Log Folder
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowLogs(false)}>
                Close
              </Button>
            </div>
          </div>
          <pre className="text-xs text-slate-300 bg-black/50 p-3 rounded max-h-60 overflow-auto whitespace-pre-wrap font-mono">
            {logContent || '(No logs available yet)'}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ProviderContentProps {
  providers: ProviderTypeInfo[];
  selectedProvider: string | null;
  onSelectProvider: (id: string | null) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onConfiguredChange: (configured: boolean) => void;
}

function ProviderContent({
  providers,
  selectedProvider,
  onSelectProvider,
  apiKey,
  onApiKeyChange,
  onConfiguredChange,
}: ProviderContentProps) {
  const { t } = useTranslation(['setup', 'settings']);
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [selectedProviderConfigId, setSelectedProviderConfigId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [providerSelectionHydrated, setProviderSelectionHydrated] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const jurismindAutoBindAttemptedRef = useRef(false);

  const [authMode, setAuthMode] = useState<'oauth' | 'apikey'>('oauth');
  const setupDefaultSyncPolicy = selectedProvider === 'jurismind' ? 'always' : 'if-empty';

  // OAuth Flow State
  const [oauthFlowing, setOauthFlowing] = useState(false);
  const [oauthData, setOauthData] = useState<{
    verificationUri: string;
    userCode: string;
    expiresIn: number;
  } | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Manage OAuth events
  useEffect(() => {
    const handleCode = (data: unknown) => {
      setOauthData(data as { verificationUri: string; userCode: string; expiresIn: number });
      setOauthError(null);
    };

    const handleSuccess = async () => {
      setOauthFlowing(false);
      setOauthData(null);
      setKeyValid(true);

      if (selectedProvider && shouldAutoSelectLawClawProvider('setup')) {
        try {
          await window.electron.ipcRenderer.invoke('provider:setDefault', selectedProvider, {
            syncPolicy: setupDefaultSyncPolicy,
          });
        } catch (error) {
          console.error('Failed to set default provider:', error);
        }
      }

      onConfiguredChange(true);
      toast.success(t('provider.valid'));
    };

    const handleError = (data: unknown) => {
      setOauthError((data as { message: string }).message);
      setOauthData(null);
    };

    window.electron.ipcRenderer.on('oauth:code', handleCode);
    window.electron.ipcRenderer.on('oauth:success', handleSuccess);
    window.electron.ipcRenderer.on('oauth:error', handleError);

    return () => {
      // Clean up manually if the API provides removeListener, though `on` in preloads might not return an unsub.
      // Easiest is to just let it be, or if they have `off`:
      if (typeof window.electron.ipcRenderer.off === 'function') {
        window.electron.ipcRenderer.off('oauth:code', handleCode);
        window.electron.ipcRenderer.off('oauth:success', handleSuccess);
        window.electron.ipcRenderer.off('oauth:error', handleError);
      }
    };
  }, [onConfiguredChange, setupDefaultSyncPolicy, t, selectedProvider]);

  const handleStartOAuth = async () => {
    if (!selectedProvider) return;

    try {
      const list = await window.electron.ipcRenderer.invoke('provider:list') as Array<{ type: string }>;
      const existingTypes = new Set(list.map(l => l.type));
      if (selectedProvider === 'minimax-portal' && existingTypes.has('minimax-portal-cn')) {
        toast.error(t('settings:aiProviders.toast.minimaxConflict'));
        return;
      }
      if (selectedProvider === 'minimax-portal-cn' && existingTypes.has('minimax-portal')) {
        toast.error(t('settings:aiProviders.toast.minimaxConflict'));
        return;
      }
    } catch {
      // ignore check failure
    }

    setOauthFlowing(true);
    setOauthData(null);
    setOauthError(null);

    try {
      await window.electron.ipcRenderer.invoke('provider:requestOAuth', selectedProvider);
    } catch (e) {
      setOauthError(String(e));
      setOauthFlowing(false);
    }
  };

  const handleCancelOAuth = async () => {
    setOauthFlowing(false);
    setOauthData(null);
    setOauthError(null);
    await window.electron.ipcRenderer.invoke('provider:cancelOAuth');
  };

  // Keep setup provider selection empty until the user explicitly chooses one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await window.electron.ipcRenderer.invoke('provider:list');
        if (!cancelled) {
          onSelectProvider(null);
          setSelectedProviderConfigId(null);
          onApiKeyChange('');
          setBaseUrl('');
          setModelId('');
          setKeyValid(null);
          onConfiguredChange(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load provider list:', error);
          onSelectProvider(null);
          setSelectedProviderConfigId(null);
          onApiKeyChange('');
          setBaseUrl('');
          setModelId('');
          setKeyValid(null);
          onConfiguredChange(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [onApiKeyChange, onConfiguredChange, onSelectProvider]);

  // When provider changes, load stored key + reset base URL
  useEffect(() => {
    let cancelled = false;
    setProviderSelectionHydrated(false);
    (async () => {
      if (!selectedProvider) {
        if (!cancelled) {
          setProviderSelectionHydrated(true);
        }
        return;
      }
      try {
        const list = await window.electron.ipcRenderer.invoke('provider:list') as Array<{ id: string; type: string; hasKey: boolean }>;
        const defaultId = await window.electron.ipcRenderer.invoke('provider:getDefault') as string | null;
        const sameType = list.filter((p) => p.type === selectedProvider);
        const preferredInstance =
          (defaultId && sameType.find((p) => p.id === defaultId))
          || sameType.find((p) => p.hasKey)
          || sameType[0];
        const providerIdForLoad = preferredInstance?.id || selectedProvider;
        setSelectedProviderConfigId(providerIdForLoad);

        const savedProvider = await window.electron.ipcRenderer.invoke(
          'provider:get',
          providerIdForLoad
        ) as { baseUrl?: string; model?: string } | null;
        const storedKey = await window.electron.ipcRenderer.invoke('provider:getApiKey', providerIdForLoad) as string | null;
        if (!cancelled) {
          if (storedKey) {
            onApiKeyChange(storedKey);
          }

          const info = providers.find((p) => p.id === selectedProvider);
          setBaseUrl(savedProvider?.baseUrl || info?.defaultBaseUrl || '');
          setModelId(savedProvider?.model || info?.defaultModelId || '');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load provider key:', error);
        }
      } finally {
        if (!cancelled) {
          setProviderSelectionHydrated(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [onApiKeyChange, selectedProvider, providers]);

  useEffect(() => {
    if (!providerMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target as Node)) {
        setProviderMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProviderMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [providerMenuOpen]);

  const selectedProviderData = providers.find((p) => p.id === selectedProvider);
  const selectedProviderIconUrl = selectedProviderData
    ? getProviderIconUrl(selectedProviderData.id)
    : undefined;
  const showBaseUrlField = selectedProviderData?.showBaseUrl ?? false;
  const showModelIdField = selectedProviderData?.showModelId ?? false;
  const requiresKey = selectedProviderData?.requiresApiKey ?? false;
  const isOAuth = selectedProviderData?.isOAuth ?? false;
  const supportsApiKey = selectedProviderData?.supportsApiKey ?? false;
  const useOAuthFlow = isOAuth && (!supportsApiKey || authMode === 'oauth');
  const isJurismind = selectedProvider === 'jurismind';

  const saveProviderConfig = useCallback(
    async (providerApiKey?: string) => {
      if (!selectedProvider) {
        throw new Error('Provider not selected');
      }

      const effectiveBaseUrl = showBaseUrlField ? (baseUrl.trim() || undefined) : undefined;
      const effectiveModelId = showModelIdField ? (modelId.trim() || undefined) : undefined;
      const providerIdForSave =
        selectedProvider === 'custom'
          ? (selectedProviderConfigId?.startsWith('custom-')
            ? selectedProviderConfigId
            : `custom-${crypto.randomUUID()}`)
          : selectedProvider;

      const saveResult = await window.electron.ipcRenderer.invoke(
        'provider:save',
        {
          id: providerIdForSave,
          name: selectedProvider === 'custom'
            ? t('settings:aiProviders.custom')
            : (selectedProviderData?.name || selectedProvider),
          type: selectedProvider,
          baseUrl: effectiveBaseUrl,
          model: effectiveModelId,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        providerApiKey || undefined
      ) as { success: boolean; error?: string };

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save provider config');
      }

      if (shouldAutoSelectLawClawProvider('setup')) {
        const defaultResult = await window.electron.ipcRenderer.invoke(
          'provider:setDefault',
          providerIdForSave,
          { syncPolicy: setupDefaultSyncPolicy }
        ) as { success: boolean; error?: string };

        if (!defaultResult.success) {
          throw new Error(defaultResult.error || 'Failed to set default provider');
        }
      }

      setSelectedProviderConfigId(providerIdForSave);
      setKeyValid(true);
      onConfiguredChange(true);
      return providerIdForSave;
    },
    [
      baseUrl,
      modelId,
      onConfiguredChange,
      selectedProvider,
      selectedProviderConfigId,
      selectedProviderData?.name,
      setupDefaultSyncPolicy,
      showBaseUrlField,
      showModelIdField,
      t,
    ]
  );

  const handleBindJurismindToken = useCallback(async () => {
    setValidating(true);
    setKeyValid(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('provider:bindJurismindToken') as {
        success?: boolean;
        error?: string;
        tokenKey?: string;
      };

      if (!result?.success || !result?.tokenKey) {
        throw new Error(result?.error || 'Jurismind token binding failed');
      }

      onApiKeyChange(String(result.tokenKey));
      await saveProviderConfig(String(result.tokenKey));
      toast.success(t('provider.valid'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKeyValid(false);
      onConfiguredChange(false);
      toast.error(message);
    } finally {
      setValidating(false);
    }
  }, [onApiKeyChange, onConfiguredChange, saveProviderConfig, t]);

  const handleValidateAndSave = async () => {
    if (!selectedProvider) return;

    try {
      const list = await window.electron.ipcRenderer.invoke('provider:list') as Array<{ type: string }>;
      const existingTypes = new Set(list.map(l => l.type));
      if (selectedProvider === 'minimax-portal' && existingTypes.has('minimax-portal-cn')) {
        toast.error(t('settings:aiProviders.toast.minimaxConflict'));
        return;
      }
      if (selectedProvider === 'minimax-portal-cn' && existingTypes.has('minimax-portal')) {
        toast.error(t('settings:aiProviders.toast.minimaxConflict'));
        return;
      }
    } catch {
      // ignore check failure
    }

    setValidating(true);
    setKeyValid(null);

    try {
      // Validate key if the provider requires one and a key was entered
      if (requiresKey && apiKey) {
        const result = await window.electron.ipcRenderer.invoke(
          'provider:validateKey',
          selectedProviderConfigId || selectedProvider,
          apiKey,
          { baseUrl: showBaseUrlField ? (baseUrl.trim() || undefined) : undefined }
        ) as { valid: boolean; error?: string };

        setKeyValid(result.valid);

        if (!result.valid) {
          toast.error(result.error || t('provider.invalid'));
          setValidating(false);
          return;
        }
      } else {
        setKeyValid(true);
      }

      await saveProviderConfig(apiKey || undefined);
      toast.success(t('provider.valid'));
    } catch (error) {
      setKeyValid(false);
      onConfiguredChange(false);
      toast.error('Configuration failed: ' + String(error));
    } finally {
      setValidating(false);
    }
  };

  // Can the user submit?
  const canSubmit =
    selectedProvider
    && (requiresKey ? apiKey.length > 0 : true)
    && (showModelIdField ? modelId.trim().length > 0 : true)
    && !useOAuthFlow
    && !isJurismind;

  const handleSelectProvider = (providerId: string) => {
    jurismindAutoBindAttemptedRef.current = false;
    onSelectProvider(providerId);
    setSelectedProviderConfigId(null);
    onConfiguredChange(false);
    onApiKeyChange('');
    setKeyValid(null);
    setProviderMenuOpen(false);
    setAuthMode('oauth');
  };

  useEffect(() => {
    if (!isJurismind || !selectedProviderData || !providerSelectionHydrated) {
      jurismindAutoBindAttemptedRef.current = false;
      return;
    }

    if (selectedProviderConfigId && apiKey) {
      jurismindAutoBindAttemptedRef.current = false;
      return;
    }

    if (jurismindAutoBindAttemptedRef.current) {
      return;
    }

    jurismindAutoBindAttemptedRef.current = true;
    void handleBindJurismindToken();
  }, [
    apiKey,
    handleBindJurismindToken,
    isJurismind,
    providerSelectionHydrated,
    selectedProviderConfigId,
    selectedProviderData,
  ]);

  return (
    <div className="space-y-6">
      {/* Provider selector — dropdown */}
      <div className="space-y-2">
        <Label>{t('provider.label')}</Label>
        <div className="relative" ref={providerMenuRef}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={providerMenuOpen}
            onClick={() => setProviderMenuOpen((open) => !open)}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
              'flex items-center justify-between gap-2',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedProvider && selectedProviderData ? (
                selectedProviderIconUrl ? (
                  <img
                    src={selectedProviderIconUrl}
                    alt={selectedProviderData.name}
                    className={cn('h-4 w-4 shrink-0', shouldInvertInDark(selectedProviderData.id) && 'dark:invert')}
                  />
                ) : (
                  <span className="text-sm leading-none shrink-0">{selectedProviderData.icon}</span>
                )
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">—</span>
              )}
              <span className={cn('truncate text-left', !selectedProvider && 'text-muted-foreground')}>
                {selectedProviderData
                  ? `${selectedProviderData.id === 'custom' ? t('settings:aiProviders.custom') : selectedProviderData.name}${selectedProviderData.model ? ` — ${selectedProviderData.model}` : ''}`
                  : t('provider.selectPlaceholder')}
              </span>
            </div>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', providerMenuOpen && 'rotate-180')} />
          </button>

          {providerMenuOpen && (
            <div
              role="listbox"
              className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-64 overflow-auto"
            >
              {providers.map((p) => {
                const iconUrl = getProviderIconUrl(p.id);
                const isSelected = selectedProvider === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectProvider(p.id)}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2',
                      'hover:bg-accent transition-colors',
                      isSelected && 'bg-accent/60'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt={p.name}
                          className={cn('h-4 w-4 shrink-0', shouldInvertInDark(p.id) && 'dark:invert')}
                        />
                      ) : (
                        <span className="text-sm leading-none shrink-0">{p.icon}</span>
                      )}
                      <span className="truncate">{p.id === 'custom' ? t('settings:aiProviders.custom') : p.name}{p.model ? ` — ${p.model}` : ''}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic config fields based on selected provider */}
      {selectedProvider && (
        <motion.div
          key={selectedProvider}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Base URL field (for siliconflow, ollama, custom) */}
          {showBaseUrlField && (
            <div className="space-y-2">
              <Label htmlFor="baseUrl">{t('provider.baseUrl')}</Label>
              <Input
                id="baseUrl"
                type="text"
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  onConfiguredChange(false);
                }}
                autoComplete="off"
                className="bg-background border-input"
              />
            </div>
          )}

          {/* Model ID field (for siliconflow etc.) */}
          {showModelIdField && (
            <div className="space-y-2">
              <Label htmlFor="modelId">{t('provider.modelId')}</Label>
              <Input
                id="modelId"
                type="text"
                placeholder={selectedProviderData?.modelIdPlaceholder || 'e.g. deepseek-ai/DeepSeek-V3'}
                value={modelId}
                onChange={(e) => {
                  setModelId(e.target.value);
                  onConfiguredChange(false);
                }}
                autoComplete="off"
                className="bg-background border-input"
              />
              <p className="text-xs text-muted-foreground">
                {t('provider.modelIdDesc')}
              </p>
            </div>
          )}

          {/* Auth mode toggle for providers supporting both */}
          {isOAuth && supportsApiKey && (
            <div className="flex rounded-lg border overflow-hidden text-sm">
              <button
                onClick={() => setAuthMode('oauth')}
                className={cn(
                  'flex-1 py-2 px-3 transition-colors',
                  authMode === 'oauth' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {t('settings:aiProviders.oauth.loginMode')}
              </button>
              <button
                onClick={() => setAuthMode('apikey')}
                className={cn(
                  'flex-1 py-2 px-3 transition-colors',
                  authMode === 'apikey' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {t('settings:aiProviders.oauth.apikeyMode')}
              </button>
            </div>
          )}

          {/* API Key field (hidden for ollama / Jurismind SSO auto-bind) */}
          {(!isOAuth || (supportsApiKey && authMode === 'apikey')) && requiresKey && !isJurismind && (
            <div className="space-y-2">
              <Label htmlFor="apiKey">{t('provider.apiKey')}</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showKey ? 'text' : 'password'}
                  placeholder={selectedProviderData?.placeholder}
                  value={apiKey}
                  onChange={(e) => {
                    onApiKeyChange(e.target.value);
                    onConfiguredChange(false);
                    setKeyValid(null);
                  }}
                  autoComplete="off"
                  className="pr-10 bg-background border-input"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {isJurismind && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {t('provider.jurismindBrowserAuth')}
            </div>
          )}

          {/* Device OAuth Trigger */}
          {useOAuthFlow && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 text-center">
                <p className="text-sm text-blue-200 mb-3 block">
                  This provider requires signing in via your browser.
                </p>
                <Button
                  onClick={handleStartOAuth}
                  disabled={oauthFlowing}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {oauthFlowing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting...</>
                  ) : (
                    'Login with Browser'
                  )}
                </Button>
              </div>

              {/* OAuth Active State Modal / Inline View */}
              {oauthFlowing && (
                <div className="mt-4 p-4 border rounded-xl bg-card relative overflow-hidden">
                  {/* Background pulse effect */}
                  <div className="absolute inset-0 bg-primary/5 animate-pulse" />

                  <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4">
                    {oauthError ? (
                      <div className="text-red-400 space-y-2">
                        <XCircle className="h-8 w-8 mx-auto" />
                        <p className="font-medium">Authentication Failed</p>
                        <p className="text-sm opacity-80">{oauthError}</p>
                        <Button variant="outline" size="sm" onClick={handleCancelOAuth} className="mt-2">
                          Try Again
                        </Button>
                      </div>
                    ) : !oauthData ? (
                      <div className="space-y-3 py-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                        <p className="text-sm text-muted-foreground animate-pulse">Requesting secure login code...</p>
                      </div>
                    ) : (
                      <div className="space-y-4 w-full">
                        <div className="space-y-1">
                          <h3 className="font-medium text-lg">Approve Login</h3>
                          <div className="text-sm text-muted-foreground text-left mt-2 space-y-1">
                            <p>1. Copy the authorization code below.</p>
                            <p>2. Open the login page in your browser.</p>
                            <p>3. Paste the code to approve access.</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-2 p-3 bg-background border rounded-lg">
                          <code className="text-2xl font-mono tracking-widest font-bold text-primary">
                            {oauthData.userCode}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(oauthData.userCode);
                              toast.success('Code copied to clipboard');
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => window.electron.ipcRenderer.invoke('shell:openExternal', oauthData.verificationUri)}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open Login Page
                        </Button>

                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Waiting for approval in browser...</span>
                        </div>

                        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={handleCancelOAuth}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validate & Save */}
          <Button
            onClick={handleValidateAndSave}
            disabled={!canSubmit || validating}
            className={cn('w-full', (useOAuthFlow || isJurismind) && 'hidden')}
          >
            {validating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {requiresKey ? t('provider.validateSave') : t('provider.save')}
          </Button>

          {keyValid !== null && (
            <p className={cn('text-sm text-center', keyValid ? 'text-green-400' : 'text-red-400')}>
              {keyValid ? `✓ ${t('provider.valid')}` : `✗ ${t('provider.invalid')}`}
            </p>
          )}

          <p className="text-sm text-muted-foreground text-center">
            {t('provider.storedLocally')}
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ==================== Setup Channel Content ====================

function renderSetupChannelIcon(_type: ChannelType, icon: string) {
  return <span className="text-3xl">{icon}</span>;
}

function SetupChannelContent() {
  const { t } = useTranslation(['setup', 'channels']);
  const lawclawAppUrl = 'https://lawclaw-app.jurismind.com';
  const [selectedChannel, setSelectedChannel] = useState<ChannelType | null>(null);
  const [showJurismindHint, setShowJurismindHint] = useState(false);
  const [jurismindLoading, setJurismindLoading] = useState(false);
  const [jurismindConnected, setJurismindConnected] = useState(false);
  const [jurismindConfigured, setJurismindConfigured] = useState(false);
  const [jurismindPairUrl, setJurismindPairUrl] = useState<string>('');
  const [jurismindQrCode, setJurismindQrCode] = useState<string | null>(null);
  const [jurismindError, setJurismindError] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const meta: ChannelMeta | null = selectedChannel ? CHANNEL_META[selectedChannel] : null;
  const primaryChannels = getPrimaryChannels().filter((type) => type !== 'qqbot');

  const applyJurismindStatus = useCallback((status: unknown) => {
    const data = status as {
      connected?: boolean;
      hasBinding?: boolean;
      pairUrl?: string | null;
      pairQrCode?: string | null;
      lastError?: string | null;
    } | null;

    if (!data || typeof data !== 'object') return;
    if (typeof data.connected === 'boolean') {
      setJurismindConnected(data.connected);
    }
    if (typeof data.hasBinding === 'boolean') {
      const configured = data.hasBinding || data.connected === true;
      setJurismindConfigured(configured);
    } else if (typeof data.connected === 'boolean' && data.connected) {
      setJurismindConfigured(true);
    }
    if ('pairUrl' in data) {
      setJurismindPairUrl(typeof data.pairUrl === 'string' ? data.pairUrl : '');
    }
    if ('pairQrCode' in data) {
      setJurismindQrCode(typeof data.pairQrCode === 'string' ? data.pairQrCode : null);
    }
    if ('lastError' in data) {
      setJurismindError(typeof data.lastError === 'string' && data.lastError ? data.lastError : null);
    }
  }, []);

  const startJurismindPairing = useCallback(async (options: { forceRefresh?: boolean; resetAuth?: boolean } = {}) => {
    const forceRefresh = options.forceRefresh === true;
    const resetAuth = options.resetAuth === true;
    setJurismindLoading(true);
    if (forceRefresh || resetAuth) {
      setJurismindError(null);
      setJurismindConnected(false);
      setJurismindPairUrl('');
      setJurismindQrCode(null);
    }

    try {
      const result = await window.electron.ipcRenderer.invoke('jurismind:startPairing', {
        forceRefresh,
        resetAuth,
        timeoutMs: 30000,
      }) as {
        success?: boolean;
        error?: string;
        result?: { pairUrl?: string; pairQrCode?: string | null };
        status?: unknown;
      };

      if (!result?.success) {
        throw new Error(result?.error || 'start pairing failed');
      }

      const pairUrl = String(result?.result?.pairUrl || '').trim();
      if (pairUrl) {
        setJurismindPairUrl(pairUrl);
      }
      if (typeof result?.result?.pairQrCode === 'string') {
        setJurismindQrCode(result.result.pairQrCode);
      }
      applyJurismindStatus(result?.status);
      setJurismindError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJurismindError(message);
    } finally {
      setJurismindLoading(false);
    }
  }, [applyJurismindStatus]);

  const clearJurismindBinding = useCallback(async () => {
    setJurismindLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('jurismind:clearBinding') as {
        success?: boolean;
        error?: string;
        status?: unknown;
      };
      if (!result?.success) {
        throw new Error(result?.error || 'clear binding failed');
      }
      applyJurismindStatus(result.status);
      setJurismindConnected(false);
      setJurismindConfigured(false);
      setJurismindPairUrl('');
      setJurismindQrCode(null);
      setJurismindError(null);
      toast.success(t('channels:dialog.jurismindHint.clearSuccess'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJurismindError(message);
      toast.error(message);
    } finally {
      setJurismindLoading(false);
    }
  }, [applyJurismindStatus, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedChannel) return;
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'channel:getFormValues',
          selectedChannel
        ) as { success: boolean; values?: Record<string, string> };
        if (cancelled) return;
        if (result.success && result.values) {
          setConfigValues(result.values);
        } else {
          setConfigValues({});
        }
      } catch {
        if (!cancelled) {
          setConfigValues({});
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedChannel]);

  useEffect(() => {
    const onPairUrl = (...args: unknown[]) => {
      const payload = args[0] as { pairUrl?: string; pairQrCode?: string | null } | undefined;
      const pairUrl = String(payload?.pairUrl || '').trim();
      if (pairUrl) {
        setJurismindPairUrl(pairUrl);
      }
      if (typeof payload?.pairQrCode === 'string') {
        setJurismindQrCode(payload.pairQrCode);
      }
      setJurismindLoading(false);
      setJurismindError(null);
    };

    const onConnected = (...args: unknown[]) => {
      const payload = args[0] as { connected?: boolean } | undefined;
      if (payload?.connected !== false) {
        setJurismindConnected(true);
        setJurismindConfigured(true);
      }
      setJurismindLoading(false);
      setJurismindError(null);
      if (showJurismindHint) {
        toast.success(t('channels:dialog.jurismindHint.connectedToast'));
      }
    };

    const onStatus = (...args: unknown[]) => {
      applyJurismindStatus(args[0]);
    };

    const onError = (...args: unknown[]) => {
      const payload = args[0] as { message?: string } | undefined;
      const message = String(payload?.message || '').trim();
      if (message) {
        setJurismindError(message);
      }
      setJurismindLoading(false);
    };

    const removePairListener = window.electron.ipcRenderer.on('jurismind:pair-url', onPairUrl);
    const removeConnectedListener = window.electron.ipcRenderer.on('jurismind:connected', onConnected);
    const removeStatusListener = window.electron.ipcRenderer.on('jurismind:status', onStatus);
    const removeErrorListener = window.electron.ipcRenderer.on('jurismind:error', onError);

    return () => {
      if (typeof removePairListener === 'function') removePairListener();
      if (typeof removeConnectedListener === 'function') removeConnectedListener();
      if (typeof removeStatusListener === 'function') removeStatusListener();
      if (typeof removeErrorListener === 'function') removeErrorListener();
    };
  }, [applyJurismindStatus, showJurismindHint, t]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const statusResult = await window.electron.ipcRenderer.invoke('jurismind:getStatus') as {
          success?: boolean;
          status?: unknown;
        };
        if (cancelled) return;
        if (statusResult?.success) {
          applyJurismindStatus(statusResult.status);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyJurismindStatus]);

  useEffect(() => {
    if (!showJurismindHint) return;

    let cancelled = false;
    setJurismindError(null);

    (async () => {
      try {
        const statusResult = await window.electron.ipcRenderer.invoke('jurismind:getStatus') as {
          success?: boolean;
          status?: unknown;
        };
        if (cancelled) return;
        if (statusResult?.success) {
          applyJurismindStatus(statusResult.status);
        }
      } catch {
        // ignore
      }

      if (!cancelled) {
        void startJurismindPairing();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyJurismindStatus, showJurismindHint, startJurismindPairing]);

  const isFormValid = () => {
    if (!meta) return false;
    return meta.configFields
      .filter((f: ChannelConfigField) => f.required)
      .every((f: ChannelConfigField) => configValues[f.key]?.trim());
  };

  const handleSave = async () => {
    if (!selectedChannel || !meta || !isFormValid()) return;
    if (meta.comingSoon) {
      toast.info(t('channel.comingSoon'));
      return;
    }

    setSaving(true);
    setValidationError(null);

    try {
      // Validate credentials first
      const validation = await window.electron.ipcRenderer.invoke(
        'channel:validateCredentials',
        selectedChannel,
        configValues
      ) as { success: boolean; valid?: boolean; errors?: string[]; details?: Record<string, string> };

      if (!validation.valid) {
        setValidationError((validation.errors || ['Validation failed']).join(', '));
        setSaving(false);
        return;
      }

      // Save config
      await window.electron.ipcRenderer.invoke('channel:saveConfig', selectedChannel, {
        ...configValues,
      });
      const botName = validation.details?.botUsername ? ` (@${validation.details.botUsername})` : '';
      toast.success(`${meta.name} configured${botName}`);
      setSaved(true);
    } catch (error) {
      setValidationError(String(error));
    } finally {
      setSaving(false);
    }
  };

  // Already saved — show success
  if (saved) {
    return (
      <div className="text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-semibold">
          {t('channel.connected', { name: meta?.name || 'Channel' })}
        </h2>
        <p className="text-muted-foreground">
          {t('channel.connectedDesc')}
        </p>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            setSaved(false);
            setSelectedChannel(null);
            setConfigValues({});
          }}
        >
          {t('channel.configureAnother')}
        </Button>
      </div>
    );
  }

  // Channel type not selected — show picker
  if (!selectedChannel) {
    return (
      <>
        <div className="space-y-4">
          <div className="text-center mb-2">
            <div className="text-4xl mb-3">📡</div>
            <h2 className="text-xl font-semibold">{t('channel.title')}</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {t('channel.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {primaryChannels.map((type) => {
              const channelMeta = CHANNEL_META[type];
              const isJurismind = type === 'jurismind';
              if (!isJurismind && type !== 'feishu' && channelMeta.connectionType !== 'token') return null;
              const isComingSoon = channelMeta.comingSoon === true && !isJurismind;
              const isConfigured = isJurismind ? jurismindConfigured : false;
              return (
                <button
                  key={type}
                  onClick={() => {
                    if (isJurismind) {
                      setShowJurismindHint(true);
                      return;
                    }
                    if (isComingSoon) {
                      toast.info(t('channel.comingSoon'));
                      return;
                    }
                    setSelectedChannel(type);
                  }}
                  disabled={isComingSoon}
                  className={cn(
                    'p-4 rounded-lg bg-muted/50 transition-all text-left',
                    isConfigured && 'ring-1 ring-green-500/40 bg-green-500/5',
                    isComingSoon ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    {renderSetupChannelIcon(type, channelMeta.icon)}
                    {isComingSoon ? (
                      <span className="text-xs rounded bg-secondary text-secondary-foreground px-2 py-0.5">
                        {t('channels:comingSoonBadge')}
                      </span>
                    ) : isConfigured ? (
                      <span className="text-xs rounded bg-green-600 text-white px-2 py-0.5">
                        {t('channels:configuredBadge')}
                      </span>
                    ) : null}
                  </div>
                  <p className="font-medium mt-2">{channelMeta.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {t(channelMeta.description)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {showJurismindHint && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl bg-card text-card-foreground border shadow-sm">
              <div className="flex items-start justify-between p-6 pb-4">
                <div>
                  <h3 className="text-lg font-semibold">{t('channels:dialog.jurismindHint.title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('channels:dialog.jurismindHint.description')}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowJurismindHint(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">{t('channels:dialog.jurismindHint.statusLabel')}</p>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-block h-2.5 w-2.5 rounded-full',
                        jurismindConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]' : 'bg-slate-400'
                      )}
                    />
                    {jurismindConnected
                      ? t('channels:dialog.jurismindHint.statusConnected')
                      : jurismindLoading
                        ? t('channels:dialog.jurismindHint.statusLoading')
                        : t('channels:dialog.jurismindHint.statusWaiting')}
                  </p>
                  {jurismindError && (
                    <p className="text-xs text-destructive break-all">{jurismindError}</p>
                  )}
                </div>

                <div className="rounded-lg border bg-white p-3 flex flex-col items-center gap-2">
                  {jurismindQrCode ? (
                    <img src={jurismindQrCode} alt="Jurismind Pair QR" className="w-56 h-56 object-contain" />
                  ) : (
                    <div className="w-56 h-56 rounded-lg bg-muted/20 flex items-center justify-center">
                      {jurismindLoading ? (
                        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                      ) : (
                        <QrCode className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    {t('channels:dialog.jurismindHint.scanTip')}
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {t('channels:dialog.jurismindHint.urlLabel')}
                  </p>
                  <p className="font-mono text-sm break-all">{jurismindPairUrl || lawclawAppUrl}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(jurismindPairUrl || lawclawAppUrl);
                        toast.success(t('channels:dialog.jurismindHint.copied'));
                      } catch {
                        toast.error(t('channels:dialog.jurismindHint.copyFailed'));
                      }
                    }}
                  >
                    {t('channels:dialog.jurismindHint.copy')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void startJurismindPairing({ forceRefresh: true });
                    }}
                  >
                    <RefreshCw className={cn('h-4 w-4 mr-2', jurismindLoading && 'animate-spin')} />
                    {t('channels:dialog.jurismindHint.refresh')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void startJurismindPairing({ forceRefresh: true, resetAuth: true });
                    }}
                  >
                    {t('channels:dialog.jurismindHint.rebind')}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      void clearJurismindBinding();
                    }}
                  >
                    {t('channels:dialog.jurismindHint.clear')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Channel selected — show config form
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => { setSelectedChannel(null); setConfigValues({}); setValidationError(null); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            {meta && renderSetupChannelIcon(selectedChannel, meta.icon)}
            {t('channel.configure', { name: meta?.name })}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">{t(meta?.description || '')}</p>
        </div>
      </div>

      {selectedChannel !== 'feishu' && (
        <div className="p-3 rounded-lg bg-muted/50 text-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-foreground">{t('channel.howTo')}</p>
            {meta?.docsUrl && (
              <button
                onClick={() => {
                  try {
                    const url = t(meta.docsUrl!);
                    if (window.electron?.openExternal) {
                      window.electron.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  } catch {
                    // ignore
                  }
                }}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <BookOpen className="h-3 w-3" />
                {t('channel.viewDocs')}
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
            {meta?.instructions.map((inst, i) => (
              <li key={i}>{t(inst)}</li>
            ))}
          </ol>
        </div>
      )}

      {selectedChannel === 'feishu' ? (
        <FeishuOfficialOnboardingPanel
          onConnected={() => {
            setValidationError(null);
            setSaved(true);
          }}
        />
      ) : (
        <>
          {/* Config fields */}
          {meta?.configFields.map((field: ChannelConfigField) => {
            const isPassword = field.type === 'password';
            const isSelect = field.type === 'select';
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`setup-${field.key}`} className="text-foreground">
                  {t(field.label)}
                  {field.required && <span className="text-red-400 ml-1">*</span>}
                </Label>
                {isSelect ? (
                  <Select
                    id={`setup-${field.key}`}
                    value={configValues[field.key] || ''}
                    onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.label)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id={`setup-${field.key}`}
                      type={isPassword && !showSecrets[field.key] ? 'password' : 'text'}
                      placeholder={field.placeholder ? t(field.placeholder) : undefined}
                      value={configValues[field.key] || ''}
                      onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      autoComplete="off"
                      className="font-mono text-sm bg-background border-input"
                    />
                    {isPassword && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                      >
                        {showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                )}
                {field.description && (
                  <p className="text-xs text-slate-500 mt-1">{t(field.description)}</p>
                )}
              </div>
            );
          })}

          {/* Validation error */}
          {validationError && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Save button */}
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!isFormValid() || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('provider.validateSave')}
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {t('provider.validateSave')}
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}

// NOTE: SkillsContent component removed - auto-install essential skills

// Installation status for each skill
type InstallStatus = 'pending' | 'installing' | 'completed' | 'failed';

interface SkillInstallState {
  id: string;
  name: string;
  description: string;
  status: InstallStatus;
}

interface InstallingContentProps {
  onComplete: (installedSkills: string[]) => void;
}

function InstallingContent({ onComplete }: InstallingContentProps) {
  const { t } = useTranslation('setup');
  const [skillStates, setSkillStates] = useState<SkillInstallState[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);

  // Real installation process
  useEffect(() => {
    let cancelled = false;
    let unsubscribeProgress: (() => void) | void;
    const itemNameMap = new Map<string, string>();

    const toInstallStatus = (status: PresetInstallProgressEvent['status']): InstallStatus => {
      if (status === 'failed') return 'failed';
      if (status === 'completed' || status === 'skipped') return 'completed';
      if (status === 'installing' || status === 'verifying') return 'installing';
      return 'pending';
    };

    const runRealInstall = async () => {
      try {
        setErrorMessage(null);
        setSkillStates([]);
        setOverallProgress(0);

        const presetStatus = await window.electron.ipcRenderer.invoke(
          'presetInstall:getStatus'
        ) as PresetInstallStatusResult;

        const plannedStates: SkillInstallState[] = presetStatus.plannedItems.map((item) => {
          const key = `${item.kind}:${item.id}`;
          const kindLabel =
            item.kind === 'plugin' ? t('installing.kind.plugin') : t('installing.kind.skill');
          const targetVersion = item.targetVersion?.trim()
            || (item.kind === 'skill' ? 'latest' : t('installing.versionUnknown'));
          const description = t('installing.presetItemDesc', {
            kind: kindLabel,
            version: targetVersion,
          });
          itemNameMap.set(key, item.displayName);
          return {
            id: key,
            name: item.displayName,
            description,
            status: 'pending',
          };
        });
        setSkillStates(plannedStates);
        setOverallProgress(5);

        // Step 1: Call the backend to install uv and setup Python
        const uvResult = await window.electron.ipcRenderer.invoke('uv:install-all') as {
          success: boolean;
          error?: string
        };

        if (!uvResult.success) {
          setSkillStates(prev => prev.map(s => ({ ...s, status: 'failed' })));
          setErrorMessage(uvResult.error || 'Unknown error during installation');
          toast.error('Environment setup failed');
          return;
        }
        setOverallProgress(30);

        unsubscribeProgress = window.electron.ipcRenderer.on('presetInstall:progress', (raw) => {
          const event = raw as PresetInstallProgressEvent;
          if (event.phase !== 'setup') return;

          const key = `${event.kind}:${event.itemId}`;
          const displayName = event.displayName || itemNameMap.get(key) || event.itemId;
          const nextStatus = toInstallStatus(event.status);
          itemNameMap.set(key, displayName);

          setSkillStates((prev) => {
            const existing = prev.find((item) => item.id === key);
            const kindLabel =
              event.kind === 'plugin' ? t('installing.kind.plugin') : t('installing.kind.skill');
            const targetVersion = event.targetVersion?.trim()
              || (event.kind === 'skill' ? 'latest' : t('installing.versionUnknown'));
            const description = t('installing.presetItemDesc', {
              kind: kindLabel,
              version: targetVersion,
            });
            if (!existing) {
              return [
                ...prev,
                {
                  id: key,
                  name: displayName,
                  description,
                  status: nextStatus,
                },
              ];
            }
            return prev.map((item) =>
              item.id === key
                ? {
                    ...item,
                    name: displayName,
                    description,
                    status: nextStatus,
                  }
                : item
            );
          });

          setOverallProgress((prev) => Math.max(prev, Math.min(90, 30 + Math.round(event.progress * 0.6))));
        });

        // Step 2: Run preset install manifest items
        const presetRunResult = await window.electron.ipcRenderer.invoke(
          'presetInstall:run',
          { phase: 'setup' }
        ) as PresetInstallRunResult;

        if (!presetRunResult.success) {
          setSkillStates((prev) => prev.map((item) => ({
            ...item,
            status: item.status === 'completed' ? item.status : 'failed',
          })));
          setErrorMessage(presetRunResult.error || 'Preset install failed');
          toast.error(t('installing.presetInstallFailed'));
          return;
        }

        setSkillStates((prev) =>
          prev.map((item) => ({
            ...item,
            status: item.status === 'failed' ? item.status : 'completed',
          }))
        );
        setOverallProgress(90);

        if (cancelled) return;
        setOverallProgress(100);

        await new Promise((resolve) => setTimeout(resolve, 800));
        if (!cancelled) {
          const installedNames = Array.from(itemNameMap.values());
          onComplete(installedNames);
        }
      } catch (err) {
        if (cancelled) return;
        setSkillStates(prev => prev.map(s => ({ ...s, status: 'failed' })));
        setErrorMessage(String(err));
        toast.error('Installation error');
      }
    };

    void runRealInstall();

    return () => {
      cancelled = true;
      if (typeof unsubscribeProgress === 'function') {
        unsubscribeProgress();
      }
    };
  }, [onComplete, retrySeed, t]);

  const getStatusIcon = (status: InstallStatus) => {
    switch (status) {
      case 'pending':
        return <div className="h-5 w-5 rounded-full border-2 border-slate-500" />;
      case 'installing':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-400" />;
    }
  };

  const getStatusText = (status: InstallStatus) => {
    switch (status) {
      case 'pending':
        return <span className="text-muted-foreground">{t('installing.status.pending')}</span>;
      case 'installing':
        return <span className="text-primary">{t('installing.status.installing')}</span>;
      case 'completed':
        return <span className="text-green-400">{t('installing.status.installed')}</span>;
      case 'failed':
        return <span className="text-red-400">{t('installing.status.failed')}</span>;
    }
  };

  const installItems: SkillInstallState[] = skillStates;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-4">⚙️</div>
        <h2 className="text-xl font-semibold mb-2">{t('installing.title')}</h2>
        <p className="text-muted-foreground">
          {t('installing.subtitle')}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('installing.progress')}</span>
          <span className="text-primary">{overallProgress}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Skill list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {installItems.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('installing.noPresetItems')}
          </p>
        )}
        {installItems.map((skill) => (
          <motion.div
            key={skill.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg',
              skill.status === 'installing' ? 'bg-muted' : 'bg-muted/50'
            )}
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(skill.status)}
              <div>
                <p className="font-medium">{skill.name}</p>
                <p className="text-xs text-muted-foreground">{skill.description}</p>
              </div>
            </div>
            {getStatusText(skill.status)}
          </motion.div>
        ))}
      </div>

      {/* Error Message Display */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-lg bg-red-900/30 border border-red-500/50 text-red-200 text-sm"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">{t('installing.error')}</p>
              <pre className="text-xs bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap font-monospace">
                {errorMessage}
              </pre>
              <Button
                variant="link"
                className="text-red-400 p-0 h-auto text-xs underline"
                onClick={() => setRetrySeed((prev) => prev + 1)}
              >
                {t('installing.retry')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {!errorMessage && (
        <p className="text-sm text-slate-400 text-center">
          {t('installing.wait')}
        </p>
      )}
    </div>
  );
}
interface CompleteContentProps {
  selectedProvider: string | null;
  installedSkills: string[];
}

function CompleteContent({ selectedProvider, installedSkills }: CompleteContentProps) {
  const { t } = useTranslation(['setup', 'settings']);
  const gatewayStatus = useGatewayStore((state) => state.status);

  const providerData = providers.find((p) => p.id === selectedProvider);
  const installedCount = installedSkills.length;

  return (
    <div className="text-center space-y-6">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-xl font-semibold">{t('complete.title')}</h2>
      <p className="text-muted-foreground">
        {t('complete.subtitle')}
      </p>

      <div className="space-y-3 text-left max-w-md mx-auto">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <span>{t('complete.provider')}</span>
          <span className="text-green-400">
            {providerData ? <span className="flex items-center gap-1.5">{getProviderIconUrl(providerData.id) ? <img src={getProviderIconUrl(providerData.id)} alt={providerData.name} className={`h-4 w-4 inline-block ${shouldInvertInDark(providerData.id) ? 'dark:invert' : ''}`} /> : providerData.icon} {providerData.id === 'custom' ? t('settings:aiProviders.custom') : providerData.name}</span> : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <span>{t('complete.components')}</span>
          <span className="text-green-400">
            {t('complete.componentsSummary', { count: installedCount })}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <span>{t('complete.gateway')}</span>
          <span className={gatewayStatus.state === 'running' ? 'text-green-400' : 'text-yellow-400'}>
            {gatewayStatus.state === 'running' ? `✓ ${t('complete.running')}` : gatewayStatus.state}
          </span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('complete.footer')}
      </p>
    </div>
  );
}

export default Setup;
