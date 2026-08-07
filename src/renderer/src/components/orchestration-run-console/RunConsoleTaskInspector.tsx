import React, { useMemo, useState } from 'react'
import type {
  OrchestrationRunConsoleSnapshot,
  OrchestrationRunConsoleTask
} from '../../../../shared/orchestration-run-console'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { openRunConsoleWorkerTerminal } from './open-run-console-worker-terminal'
import { useRunConsoleWorkerOutput } from './use-run-console-worker-output'
import {
  getInspectorTaskTitle,
  RunConsoleTaskAttempts,
  RunConsoleTaskEvidence,
  RunConsoleTaskMessages,
  RunConsoleTaskOverview,
  RunConsoleTaskWorker
} from './RunConsoleTaskInspectorSections'
import { RunConsoleWorkerActions } from './RunConsoleWorkerActions'
import type { RunConsoleOperatorCall } from './run-console-operator-types'

type InspectorTab = 'overview' | 'worker' | 'messages' | 'attempts' | 'evidence'

type RunConsoleTaskInspectorProps = {
  snapshot: OrchestrationRunConsoleSnapshot
  task: OrchestrationRunConsoleTask
  target: RuntimeClientTarget
  targetLabel: string
  callOperator?: RunConsoleOperatorCall
  actionsDisabled?: boolean
  className?: string
}

export function RunConsoleTaskInspector(props: RunConsoleTaskInspectorProps): React.JSX.Element {
  const [tab, setTab] = useState<InspectorTab>('overview')
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const context = useMemo(() => {
    const attempts = props.snapshot.dispatches
      .filter((dispatch) => dispatch.taskId === props.task.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    const worker = attempts
      .map((attempt) =>
        props.snapshot.workers.find((candidate) => candidate.dispatchId === attempt.id)
      )
      .find((candidate) => Boolean(candidate))
    return { snapshot: props.snapshot, task: props.task, attempts, worker: worker ?? null }
  }, [props.snapshot, props.task])
  const workerOutput = useRunConsoleWorkerOutput({
    target: props.target,
    dispatchId: context.worker?.dispatchId ?? null,
    enabled: tab === 'worker'
  })

  const openTerminal = async (): Promise<void> => {
    if (!context.worker) {
      return
    }
    setTerminalError(null)
    try {
      await openRunConsoleWorkerTerminal(props.target, context.worker)
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section
      className={props.className}
      aria-label={translate('auto.runConsole.inspector.label', 'Task inspector')}
    >
      <header className="border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-semibold">{getInspectorTaskTitle(props.task)}</h2>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {props.task.id}
        </p>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as InspectorTab)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="scrollbar-sleek overflow-x-auto border-b border-border px-2">
          <TabsList variant="line" className="h-10 gap-0">
            <TabsTrigger value="overview" className="text-xs">
              {translate('auto.runConsole.inspector.tab.overview', 'Overview')}
            </TabsTrigger>
            <TabsTrigger value="worker" className="text-xs">
              {translate('auto.runConsole.inspector.tab.worker', 'Worker')}
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs">
              {translate('auto.runConsole.inspector.tab.messages', 'Messages')}
            </TabsTrigger>
            <TabsTrigger value="attempts" className="text-xs">
              {translate('auto.runConsole.inspector.tab.attempts', 'Attempts')}
            </TabsTrigger>
            <TabsTrigger value="evidence" className="text-xs">
              {translate('auto.runConsole.inspector.tab.evidence', 'Evidence')}
            </TabsTrigger>
          </TabsList>
        </div>
        {terminalError ? (
          <p className="border-b border-border px-4 py-2 text-xs text-destructive">
            {terminalError}
          </p>
        ) : null}
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="overview">
            <RunConsoleTaskOverview task={props.task} />
          </TabsContent>
          <TabsContent value="worker">
            <div className="space-y-3">
              <RunConsoleTaskWorker
                context={context}
                output={workerOutput}
                onOpenTerminal={() => void openTerminal()}
              />
              {context.worker ? (
                <RunConsoleWorkerActions
                  runId={props.snapshot.run.id}
                  task={props.task}
                  dispatch={
                    context.attempts.find((attempt) => attempt.id === context.worker?.dispatchId)!
                  }
                  worker={context.worker}
                  targetLabel={props.targetLabel}
                  legacyReadOnly={props.snapshot.run.legacyReadOnly}
                  staleIdentity={context.attempts[0]?.id !== context.worker.dispatchId}
                  callOperator={props.callOperator}
                  disabled={props.actionsDisabled}
                />
              ) : null}
            </div>
          </TabsContent>
          <TabsContent value="messages">
            <RunConsoleTaskMessages context={context} />
          </TabsContent>
          <TabsContent value="attempts">
            <RunConsoleTaskAttempts context={context} />
          </TabsContent>
          <TabsContent value="evidence">
            <RunConsoleTaskEvidence context={context} />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}
