import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useOrchestrationSetupEnabled } from '@/lib/use-orchestration-setup-enabled'
import { translate } from '@/i18n/i18n'
import {
  OrchestrationRunConsoleClient,
  type RunConsoleClientState
} from './orchestration-run-console-client'
import { getRunConsoleTargetKey, parseRunConsoleTargetKey } from './run-console-target'
import { RunConsolePageHeader } from './RunConsolePageHeader'
import { RunConsoleRunList } from './RunConsoleRunList'
import { RunConsoleAttentionQueue } from './RunConsoleAttentionQueue'
import { getRunConsoleBlockingState } from './run-console-page-state'
import { RunConsoleTaskSurface } from './RunConsoleTaskSurface'

function resolveInitialTarget(
  key: string | null,
  activeEnvironmentId: string | null | undefined
): RuntimeClientTarget {
  return (
    parseRunConsoleTargetKey(key) ??
    (activeEnvironmentId?.trim()
      ? { kind: 'environment', environmentId: activeEnvironmentId }
      : { kind: 'local' })
  )
}

export default function OrchestrationRunConsolePage(): React.JSX.Element {
  useTranslation()
  const setupEnabled = useOrchestrationSetupEnabled()
  const closeRunsPage = useAppStore((state) => state.closeRunsPage)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const activeEnvironmentId = useAppStore((state) => state.settings?.activeRuntimeEnvironmentId)
  const targetKey = useAppStore((state) => state.runConsoleRuntimeTargetKey)
  const selectedRunId = useAppStore((state) => state.runConsoleSelectedRunId)
  const selectedTaskId = useAppStore((state) => state.runConsoleSelectedTaskId)
  const viewMode = useAppStore((state) => state.runConsoleViewMode)
  const setTargetKey = useAppStore((state) => state.setRunConsoleRuntimeTargetKey)
  const setSelectedRunId = useAppStore((state) => state.setRunConsoleSelectedRunId)
  const setSelectedTaskId = useAppStore((state) => state.setRunConsoleSelectedTaskId)
  const setViewMode = useAppStore((state) => state.setRunConsoleViewMode)
  const initialTarget = useMemo(
    () => resolveInitialTarget(targetKey, activeEnvironmentId),
    [activeEnvironmentId, targetKey]
  )
  const [clientState, setClientState] = useState<RunConsoleClientState>(() => ({
    target: initialTarget,
    capability: 'checking',
    catalog: null,
    snapshot: null,
    selectedRunId,
    loading: true,
    loadingMore: false,
    stale: false,
    error: null
  }))
  const clientRef = useRef<OrchestrationRunConsoleClient | null>(null)
  if (!clientRef.current) {
    clientRef.current = new OrchestrationRunConsoleClient(setClientState, undefined, initialTarget)
  }

  const resolvedTargetKey = getRunConsoleTargetKey(initialTarget)
  useEffect(() => {
    if (targetKey !== resolvedTargetKey) {
      setTargetKey(resolvedTargetKey)
    }
  }, [resolvedTargetKey, setTargetKey, targetKey])

  useEffect(() => {
    if (!setupEnabled) {
      return
    }
    const client = clientRef.current!
    client.setTarget(initialTarget, selectedRunId)
    client.start()
    return () => client.stop()
  }, [initialTarget, selectedRunId, setupEnabled])

  useEffect(() => {
    if (selectedRunId || !clientState.catalog?.runs[0]) {
      return
    }
    setSelectedRunId(clientState.catalog.runs[0].id)
  }, [clientState.catalog, selectedRunId, setSelectedRunId])

  useEffect(() => {
    const tasks = clientState.snapshot?.tasks ?? []
    if (tasks.length === 0 || tasks.some((task) => task.id === selectedTaskId)) {
      return
    }
    const attentionTaskId = clientState.snapshot?.attention.find((item) => item.taskId)?.taskId
    setSelectedTaskId(attentionTaskId ?? tasks[0].id)
  }, [clientState.snapshot, selectedTaskId, setSelectedTaskId])

  const unsupported = clientState.capability === 'unsupported'
  const blockingState = getRunConsoleBlockingState(setupEnabled, clientState)
  const targetEnvironmentId =
    clientState.target.kind === 'environment' ? clientState.target.environmentId : null
  const targetLabel = targetEnvironmentId
    ? (runtimeEnvironments.find((environment) => environment.id === targetEnvironmentId)?.name ??
      targetEnvironmentId)
    : translate('auto.runConsole.runtime.local', 'Local runtime')
  const callOperator = useCallback(
    <TResult,>(method: string, params: Record<string, unknown>, requestId: string) =>
      clientRef.current!.callOperator<TResult>(method, params, requestId),
    []
  )
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label={translate('auto.runConsole.title', 'Runs')}
    >
      <RunConsolePageHeader
        targetKey={resolvedTargetKey}
        environments={runtimeEnvironments}
        refreshing={clientState.loading}
        refreshDisabled={!setupEnabled || clientState.loading || unsupported}
        onTargetChange={setTargetKey}
        onRefresh={() => void clientRef.current?.refreshNow()}
        onClose={closeRunsPage}
      />
      {blockingState === 'no_setup' ? (
        <EmptySurface
          title={translate('auto.runConsole.noSetup.title', 'Orchestration setup is required')}
          description={translate(
            'auto.runConsole.noSetup.description',
            'Complete orchestration setup before opening Run Console.'
          )}
        />
      ) : blockingState === 'update_required' ? (
        <EmptySurface
          title={translate('auto.runConsole.updateRequired.title', 'Runtime update required')}
          description={translate(
            'auto.runConsole.updateRequired.description',
            'Update Orca on this runtime to inspect and supervise runs.'
          )}
        />
      ) : blockingState === 'unavailable' ? (
        <EmptySurface
          title={translate('auto.runConsole.disconnected.title', 'Runtime unavailable')}
          description={
            clientState.error ??
            translate('auto.runConsole.disconnected.description', 'Could not reach this runtime.')
          }
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,38%)_minmax(0,1fr)] md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] md:grid-rows-1">
          <RunConsoleRunList
            runs={clientState.catalog?.runs ?? []}
            selectedRunId={selectedRunId}
            loading={clientState.loading}
            loadingMore={clientState.loadingMore}
            hasMore={Boolean(clientState.catalog?.nextCursor)}
            onSelect={setSelectedRunId}
            onLoadMore={() => void clientRef.current?.loadMoreRuns()}
          />
          <main className="flex min-h-0 min-w-0 flex-col">
            {clientState.stale ? (
              <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                {translate(
                  'auto.runConsole.stale',
                  'Showing the last successful data while the runtime reconnects.'
                )}
              </div>
            ) : null}
            <RunConsoleAttentionQueue
              snapshot={clientState.snapshot}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              callOperator={callOperator}
              targetLabel={targetLabel}
              actionsDisabled={clientState.stale}
            />
            <RunConsoleTaskSurface
              snapshot={clientState.snapshot}
              selectedTaskId={selectedTaskId}
              viewMode={viewMode}
              target={clientState.target}
              targetLabel={targetLabel}
              callOperator={callOperator}
              actionsDisabled={clientState.stale}
              onSelectTask={setSelectedTaskId}
              onViewModeChange={setViewMode}
            />
          </main>
        </div>
      )}
    </section>
  )
}

function EmptySurface(props: { title: string; description: string }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <h2 className="text-sm font-semibold">{props.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
      </div>
    </div>
  )
}
