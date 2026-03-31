import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Plus, RefreshCw, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAgentsStore } from '@/stores/agents';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore, type ProviderWithKeyInfo } from '@/stores/providers';
import { CHANNEL_NAMES } from '@/types/channel';
import type { AgentSummary } from '@/types/agent';
import { getProviderTypeInfo } from '@/lib/providers';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RuntimeProviderOption {
  runtimeProviderKey: string;
  providerType: ProviderWithKeyInfo['type'];
  providerId: string;
  label: string;
  modelIdPlaceholder?: string;
  configuredModelId?: string;
  lockedModelId?: string;
}

const inputClasses = 'h-[44px] rounded-xl border-border bg-background font-mono text-[13px] shadow-sm placeholder:text-muted-foreground';
const selectClasses = 'h-[44px] w-full rounded-xl border-border bg-background px-3 font-mono text-[13px] shadow-sm';
const labelClasses = 'text-[14px] text-foreground/80 font-bold';
const modalCardClasses = 'overflow-hidden rounded-3xl border bg-card shadow-2xl';
const infoTileClasses = 'rounded-2xl border bg-muted/20 p-4';
const defaultCardClasses = 'border-primary/20 bg-background';
const agentIconClasses = 'bg-primary/10 text-primary';
const subtleButtonHoverClasses = 'hover:bg-muted/70 hover:text-foreground';

function getRuntimeProviderKey(provider: ProviderWithKeyInfo): string {
  if (provider.type === 'custom' || provider.type === 'ollama') {
    const suffix = provider.id.replace(/-/g, '').slice(0, 8);
    return `${provider.type}-${suffix}`;
  }
  if (provider.type === 'minimax-portal-cn') {
    return 'minimax-portal';
  }
  return provider.type;
}

function splitModelRef(modelRef: string | null | undefined): { providerKey: string; modelId: string } | null {
  const value = (modelRef || '').trim();
  if (!value) return null;
  const separatorIndex = value.indexOf('/');
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) return null;
  return {
    providerKey: value.slice(0, separatorIndex),
    modelId: value.slice(separatorIndex + 1),
  };
}

function getChannelLabel(channelType: string): string {
  return CHANNEL_NAMES[channelType as keyof typeof CHANNEL_NAMES] || channelType;
}

function getModelIdForRuntimeProvider(
  modelRef: string | null | undefined,
  runtimeProviderKey: string,
): string | undefined {
  const value = (modelRef || '').trim();
  if (!value) return undefined;
  if (value.startsWith(`${runtimeProviderKey}/`)) {
    return value.slice(runtimeProviderKey.length + 1);
  }
  const parsed = splitModelRef(value);
  return parsed?.modelId || value;
}

export function Agents() {
  const { t } = useTranslation('agents');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const {
    agents,
    loading,
    error,
    fetchAgents,
    createAgent,
    deleteAgent,
  } = useAgentsStore();
  const fetchProviders = useProviderStore((state) => state.fetchProviders);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<AgentSummary | null>(null);

  useEffect(() => {
    void Promise.all([fetchAgents(), fetchProviders()]);
  }, [fetchAgents, fetchProviders]);

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? null,
    [activeAgentId, agents],
  );

  const handleRefresh = () => {
    void Promise.all([fetchAgents(), fetchProviders()]);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('refresh')}
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('addAgent')}
          </Button>
        </div>
      </div>

      {gatewayStatus.state !== 'running' && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
          {t('gatewayWarning')}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onOpenSettings={() => setActiveAgentId(agent.id)}
            onDelete={() => setAgentToDelete(agent)}
          />
        ))}
      </div>

      {showAddDialog && (
        <AddAgentDialog
          onClose={() => setShowAddDialog(false)}
          onCreate={async (name, options) => {
            await createAgent(name, options);
            setShowAddDialog(false);
            toast.success(t('toast.agentCreated'));
          }}
        />
      )}

      {activeAgent && (
        <AgentSettingsModal
          agent={activeAgent}
          onClose={() => setActiveAgentId(null)}
        />
      )}

      <ConfirmDialog
        open={!!agentToDelete}
        title={t('deleteDialog.title')}
        message={agentToDelete ? t('deleteDialog.message', { name: agentToDelete.name }) : ''}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!agentToDelete) return;
          try {
            const deletedId = agentToDelete.id;
            await deleteAgent(agentToDelete.id);
            setAgentToDelete(null);
            if (activeAgentId === deletedId) {
              setActiveAgentId(null);
            }
            toast.success(t('toast.agentDeleted'));
          } catch (error) {
            toast.error(t('toast.agentDeleteFailed', { error: String(error) }));
          }
        }}
        onCancel={() => setAgentToDelete(null)}
      />
    </div>
  );
}

function AgentCard({
  agent,
  onOpenSettings,
  onDelete,
}: {
  agent: AgentSummary;
  onOpenSettings: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('agents');
  const channelsText = agent.channelTypes.length > 0
    ? agent.channelTypes.map(getChannelLabel).join(', ')
    : t('none');

  return (
    <Card className={cn('border-border/70', agent.isDefault && defaultCardClasses)}>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-full', agentIconClasses)}>
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-base font-semibold">{agent.name}</h2>
              {agent.isDefault && (
                <Badge variant="secondary" className="rounded-full">
                  <Check className="mr-1 h-3 w-3" />
                  {t('defaultBadge')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!agent.isDefault && (
                <Button variant="ghost" size="icon" onClick={onDelete} title={t('deleteAgent')} className={subtleButtonHoverClasses}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onOpenSettings} title={t('settings')} className={subtleButtonHoverClasses}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('modelLine', {
              model: agent.modelDisplay,
              suffix: agent.inheritedModel ? ` (${t('inherited')})` : '',
            })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('channelsLine', { channels: channelsText })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AddAgentDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, options: { inheritWorkspace: boolean }) => Promise<void>;
}) {
  const { t } = useTranslation('agents');
  const [name, setName] = useState('');
  const [inheritWorkspace, setInheritWorkspace] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), { inheritWorkspace });
    } catch (error) {
      toast.error(t('toast.agentCreateFailed', { error: String(error) }));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className={cn('w-full max-w-md', modalCardClasses)}>
        <CardHeader>
          <CardTitle className="text-2xl font-serif font-normal tracking-tight">
            {t('createDialog.title')}
          </CardTitle>
          <CardDescription>{t('createDialog.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="agent-name" className={labelClasses}>{t('createDialog.nameLabel')}</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('createDialog.namePlaceholder')}
              className={inputClasses}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="inherit-workspace" className={labelClasses}>{t('createDialog.inheritWorkspaceLabel')}</Label>
              <p className="text-xs text-muted-foreground">{t('createDialog.inheritWorkspaceDescription')}</p>
            </div>
            <Switch
              id="inherit-workspace"
              checked={inheritWorkspace}
              onCheckedChange={setInheritWorkspace}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving || !name.trim()}>
              {saving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('creating')}
                </>
              ) : (
                t('common:actions.save')
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentSettingsModal({
  agent,
  onClose,
}: {
  agent: AgentSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation('agents');
  const updateAgent = useAgentsStore((state) => state.updateAgent);
  const defaultModelRef = useAgentsStore((state) => state.defaultModelRef);
  const [name, setName] = useState(agent.name);
  const [savingName, setSavingName] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    setName(agent.name);
  }, [agent.name]);

  const hasNameChanges = name.trim() !== agent.name;

  const handleRequestClose = () => {
    if (savingName || hasNameChanges) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === agent.name) return;
    setSavingName(true);
    try {
      await updateAgent(agent.id, name.trim());
      toast.success(t('toast.agentUpdated'));
    } catch (error) {
      toast.error(t('toast.agentUpdateFailed', { error: String(error) }));
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className={cn('w-full max-w-2xl', modalCardClasses)}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-serif font-normal tracking-tight">
              {t('settingsDialog.title', { name: agent.name })}
            </CardTitle>
            <CardDescription>{t('settingsDialog.description')}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRequestClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 p-6 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="agent-settings-name" className={labelClasses}>{t('settingsDialog.nameLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="agent-settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                readOnly={agent.isDefault}
                className={inputClasses}
              />
              {!agent.isDefault && (
                <Button
                  variant="outline"
                  onClick={() => void handleSaveName()}
                  disabled={savingName || !name.trim() || name.trim() === agent.name}
                >
                  {savingName ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('common:actions.save')}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={infoTileClasses}>
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                {t('settingsDialog.agentIdLabel')}
              </p>
              <p className="mt-1 font-mono text-sm">{agent.id}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowModelModal(true)}
              className={cn(infoTileClasses, 'text-left transition-colors hover:bg-muted/35')}
            >
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                {t('settingsDialog.modelLabel')}
              </p>
              <p className="mt-1 text-sm">
                {agent.modelDisplay}
                {agent.inheritedModel ? ` (${t('inherited')})` : ''}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {agent.modelRef || defaultModelRef || '-'}
              </p>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-serif font-normal tracking-tight">{t('settingsDialog.channelsTitle')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('settingsDialog.channelsDescription')}</p>
            </div>

            {agent.channelTypes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                {t('settingsDialog.noChannels')}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {agent.channelTypes.map((channelType) => (
                  <Badge key={channelType} variant="secondary" className="rounded-full px-3 py-1">
                    {getChannelLabel(channelType)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showModelModal && (
        <AgentModelModal
          agent={agent}
          onClose={() => setShowModelModal(false)}
        />
      )}

      <ConfirmDialog
        open={showCloseConfirm}
        title={t('settingsDialog.unsavedChangesTitle')}
        message={t('settingsDialog.unsavedChangesMessage')}
        confirmLabel={t('settingsDialog.closeWithoutSaving')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => {
          setShowCloseConfirm(false);
          setName(agent.name);
          onClose();
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}

function AgentModelModal({
  agent,
  onClose,
}: {
  agent: AgentSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation('agents');
  const providers = useProviderStore((state) => state.providers);
  const defaultProviderId = useProviderStore((state) => state.defaultProviderId);
  const updateAgentModel = useAgentsStore((state) => state.updateAgentModel);
  const defaultModelRef = useAgentsStore((state) => state.defaultModelRef);
  const [selectedRuntimeProviderKey, setSelectedRuntimeProviderKey] = useState('');
  const [modelIdInput, setModelIdInput] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const runtimeProviderOptions = useMemo<RuntimeProviderOption[]>(() => {
    return providers
      .filter((provider) => provider.enabled)
      .sort((left, right) => {
        if (left.id === defaultProviderId) return -1;
        if (right.id === defaultProviderId) return 1;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .map((provider) => {
        const info = getProviderTypeInfo(provider.type);
        const runtimeProviderKey = getRuntimeProviderKey(provider);
        const configuredModelId = getModelIdForRuntimeProvider(provider.model, runtimeProviderKey);
        const defaultModelId = getModelIdForRuntimeProvider(info?.defaultModelId, runtimeProviderKey);
        const lockedModelId = provider.type === 'jurismind'
          ? (defaultModelId || configuredModelId || 'jurismind')
          : undefined;

        return {
          runtimeProviderKey,
          providerType: provider.type,
          providerId: provider.id,
          label: `${provider.name} (${info?.name || provider.type})`,
          modelIdPlaceholder: info?.modelIdPlaceholder,
          configuredModelId,
          lockedModelId,
        };
      });
  }, [defaultProviderId, providers]);

  useEffect(() => {
    const override = splitModelRef(agent.overrideModelRef);
    if (override) {
      setSelectedRuntimeProviderKey(override.providerKey);
      setModelIdInput(override.modelId);
      return;
    }

    const effective = splitModelRef(agent.modelRef || defaultModelRef);
    if (effective) {
      setSelectedRuntimeProviderKey(effective.providerKey);
      setModelIdInput(effective.modelId);
      return;
    }

    setSelectedRuntimeProviderKey(runtimeProviderOptions[0]?.runtimeProviderKey || '');
    setModelIdInput('');
  }, [agent.modelRef, agent.overrideModelRef, defaultModelRef, runtimeProviderOptions]);

  const selectedProvider = runtimeProviderOptions.find((option) => option.runtimeProviderKey === selectedRuntimeProviderKey) || null;
  const isLockedModelId = Boolean(selectedProvider?.lockedModelId);

  useEffect(() => {
    if (!selectedProvider?.lockedModelId) return;
    if (modelIdInput === selectedProvider.lockedModelId) return;
    setModelIdInput(selectedProvider.lockedModelId);
  }, [modelIdInput, selectedProvider]);

  const trimmedModelId = modelIdInput.trim();
  const nextModelRef = selectedRuntimeProviderKey && trimmedModelId
    ? `${selectedRuntimeProviderKey}/${trimmedModelId}`
    : '';
  const normalizedDefaultModelRef = (defaultModelRef || '').trim();
  const currentOverrideModelRef = (agent.overrideModelRef || '').trim();
  const isUsingDefaultModelInForm = Boolean(normalizedDefaultModelRef) && nextModelRef === normalizedDefaultModelRef;
  const desiredOverrideModelRef = nextModelRef && nextModelRef !== normalizedDefaultModelRef
    ? nextModelRef
    : null;
  const modelChanged = (desiredOverrideModelRef || '') !== currentOverrideModelRef;

  const handleRequestClose = () => {
    if (savingModel || modelChanged) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  const handleSaveModel = async () => {
    if (!selectedRuntimeProviderKey) {
      toast.error(t('toast.agentModelProviderRequired'));
      return;
    }
    if (!trimmedModelId) {
      toast.error(t('toast.agentModelIdRequired'));
      return;
    }
    if (!modelChanged) return;
    if (!nextModelRef.includes('/')) {
      toast.error(t('toast.agentModelInvalid'));
      return;
    }

    setSavingModel(true);
    try {
      await updateAgentModel(agent.id, desiredOverrideModelRef);
      toast.success(desiredOverrideModelRef ? t('toast.agentModelUpdated') : t('toast.agentModelReset'));
      onClose();
    } catch (error) {
      toast.error(t('toast.agentModelUpdateFailed', { error: String(error) }));
    } finally {
      setSavingModel(false);
    }
  };

  const handleUseDefaultModel = () => {
    const parsedDefault = splitModelRef(normalizedDefaultModelRef);
    if (!parsedDefault) {
      setSelectedRuntimeProviderKey('');
      setModelIdInput('');
      return;
    }
    setSelectedRuntimeProviderKey(parsedDefault.providerKey);
    setModelIdInput(parsedDefault.modelId);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <Card className={cn('w-full max-w-xl', modalCardClasses)}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-serif font-normal tracking-tight">
              {t('settingsDialog.modelLabel')}
            </CardTitle>
            <CardDescription>
              {t('settingsDialog.modelOverrideDescription')}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRequestClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="agent-model-provider" className="text-xs text-muted-foreground">{t('settingsDialog.modelProviderLabel')}</Label>
            <Select
              id="agent-model-provider"
              value={selectedRuntimeProviderKey}
              onChange={(event) => {
                const nextProvider = event.target.value;
                const previousProviderWasLocked = Boolean(selectedProvider?.lockedModelId);
                setSelectedRuntimeProviderKey(nextProvider);
                const option = runtimeProviderOptions.find((candidate) => candidate.runtimeProviderKey === nextProvider);
                if (option?.lockedModelId) {
                  setModelIdInput(option.lockedModelId);
                  return;
                }
                if (!modelIdInput.trim() || previousProviderWasLocked) {
                  setModelIdInput(option?.configuredModelId || '');
                }
              }}
              className={selectClasses}
            >
              <option value="">{t('settingsDialog.modelProviderPlaceholder')}</option>
              {runtimeProviderOptions.map((option) => (
                <option key={option.runtimeProviderKey} value={option.runtimeProviderKey}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-model-id" className="text-xs text-muted-foreground">{t('settingsDialog.modelIdLabel')}</Label>
            <Input
              id="agent-model-id"
              value={modelIdInput}
              onChange={(event) => setModelIdInput(event.target.value)}
              placeholder={selectedProvider?.modelIdPlaceholder || selectedProvider?.configuredModelId || t('settingsDialog.modelIdPlaceholder')}
              className={inputClasses}
              disabled={isLockedModelId}
              readOnly={isLockedModelId}
            />
          </div>

          {!!nextModelRef && (
            <p className="break-all font-mono text-xs text-muted-foreground">
              {t('settingsDialog.modelPreview')}: {nextModelRef}
            </p>
          )}

          {runtimeProviderOptions.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('settingsDialog.modelProviderEmpty')}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleUseDefaultModel}
              disabled={savingModel || !normalizedDefaultModelRef || isUsingDefaultModelInForm}
            >
              {t('settingsDialog.useDefaultModel')}
            </Button>
            <Button variant="outline" onClick={handleRequestClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              onClick={() => void handleSaveModel()}
              disabled={savingModel || !selectedRuntimeProviderKey || !trimmedModelId || !modelChanged}
            >
              {savingModel ? <RefreshCw className="h-4 w-4 animate-spin" /> : t('common:actions.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showCloseConfirm}
        title={t('settingsDialog.unsavedChangesTitle')}
        message={t('settingsDialog.unsavedChangesMessage')}
        confirmLabel={t('settingsDialog.closeWithoutSaving')}
        cancelLabel={t('common:actions.cancel')}
        onConfirm={() => {
          setShowCloseConfirm(false);
          onClose();
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}

export default Agents;
