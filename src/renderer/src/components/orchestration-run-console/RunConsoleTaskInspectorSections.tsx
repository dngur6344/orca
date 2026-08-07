import React from 'react'
import type {
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleSnapshot,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from '../../../../shared/orchestration-run-console'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { formatRunConsoleWorkerOutput } from './run-console-worker-output'
import type { RunConsoleWorkerOutputState } from './use-run-console-worker-output'
import {
  getRunConsoleTaskStatusLabel,
  getRunConsoleTaskTitle
} from './run-console-task-presentation'

type InspectorContext = {
  snapshot: OrchestrationRunConsoleSnapshot
  task: OrchestrationRunConsoleTask
  attempts: OrchestrationRunConsoleDispatch[]
  worker: OrchestrationRunConsoleWorker | null
}

export function RunConsoleTaskOverview({
  task
}: Pick<InspectorContext, 'task'>): React.JSX.Element {
  return (
    <div className="space-y-4 text-xs">
      <InspectorField label={translate('auto.runConsole.inspector.status', 'Status')}>
        <Badge variant="outline">{getRunConsoleTaskStatusLabel(task.status)}</Badge>
      </InspectorField>
      <InspectorField label={translate('auto.runConsole.inspector.taskId', 'Task ID')}>
        <code className="break-all text-[11px]">{task.id}</code>
      </InspectorField>
      <InspectorField label={translate('auto.runConsole.inspector.dependencies', 'Dependencies')}>
        {task.dependencyIds.length > 0 ? task.dependencyIds.join(', ') : '—'}
      </InspectorField>
      <InspectorField label={translate('auto.runConsole.inspector.spec', 'Specification')}>
        <p className="whitespace-pre-wrap text-foreground">{task.spec}</p>
      </InspectorField>
      {task.result ? (
        <InspectorField label={translate('auto.runConsole.inspector.result', 'Result')}>
          <p className="whitespace-pre-wrap text-foreground">{task.result}</p>
        </InspectorField>
      ) : null}
    </div>
  )
}

export function RunConsoleTaskWorker(props: {
  context: InspectorContext
  output: RunConsoleWorkerOutputState
  onOpenTerminal: () => void
}): React.JSX.Element {
  const { worker } = props.context
  if (!worker) {
    return (
      <EmptyInspectorText
        text={translate(
          'auto.runConsole.inspector.noWorker',
          'No worker is attached to this task.'
        )}
      />
    )
  }
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{worker.workerState}</Badge>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {worker.dispatchId}
        </span>
        {(worker.agentTerminalHandle || worker.federation?.remoteTerminalHandle) && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs"
            onClick={props.onOpenTerminal}
          >
            {translate('auto.runConsole.inspector.openTerminal', 'Open terminal')}
          </Button>
        )}
      </div>
      {props.output.loading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {translate('auto.runConsole.inspector.loadingOutput', 'Loading worker output…')}
        </div>
      ) : props.output.error ? (
        <p className="rounded-md border border-border p-3 text-muted-foreground">
          {props.output.error}
        </p>
      ) : props.output.result ? (
        <pre className="scrollbar-sleek max-h-80 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] whitespace-pre-wrap">
          {formatRunConsoleWorkerOutput(props.output.result) ||
            translate('auto.runConsole.inspector.emptyOutput', 'No worker output is available.')}
        </pre>
      ) : null}
    </div>
  )
}

export function RunConsoleTaskMessages({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const handles = new Set([
    ...context.attempts.map((attempt) => `dispatch:${attempt.id}`),
    ...context.attempts.map((attempt) => attempt.assigneeHandle).filter(Boolean)
  ])
  const messages = context.snapshot.messages.filter(
    (message) => handles.has(message.fromHandle) || handles.has(message.toHandle)
  )
  if (messages.length === 0) {
    return (
      <EmptyInspectorText
        text={translate(
          'auto.runConsole.inspector.noMessages',
          'No message references for this task.'
        )}
      />
    )
  }
  return (
    <div className="space-y-2">
      {messages.map((message) => (
        <div key={message.id} className="rounded-md border border-border p-2.5">
          <p className="truncate text-xs font-medium">{message.subject}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {message.fromHandle} → {message.toHandle}
          </p>
        </div>
      ))}
    </div>
  )
}

export function RunConsoleTaskAttempts({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  if (context.attempts.length === 0) {
    return (
      <EmptyInspectorText
        text={translate('auto.runConsole.inspector.noAttempts', 'No dispatch attempts yet.')}
      />
    )
  }
  return (
    <div className="space-y-2">
      {context.attempts.map((attempt) => (
        <div key={attempt.id} className="rounded-md border border-border p-2.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{attempt.status}</Badge>
            <code className="min-w-0 truncate text-[11px]">{attempt.id}</code>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {attempt.assigneeHandle ??
              translate('auto.runConsole.inspector.unassigned', 'Unassigned')}{' '}
            · {attempt.failureCount} {translate('auto.runConsole.inspector.failures', 'failures')}
          </p>
        </div>
      ))}
    </div>
  )
}

export function RunConsoleTaskEvidence({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const actions = context.snapshot.operatorActions.filter(
    (action) =>
      action.taskId === context.task.id ||
      context.attempts.some((attempt) => attempt.id === action.dispatchId)
  )
  const attention = context.snapshot.attention.filter((item) => item.taskId === context.task.id)
  if (actions.length === 0 && attention.length === 0) {
    return (
      <EmptyInspectorText
        text={translate(
          'auto.runConsole.inspector.noEvidence',
          'No attention or operator evidence for this task.'
        )}
      />
    )
  }
  return (
    <div className="space-y-2">
      {attention.map((item) => (
        <div key={item.id} className="rounded-md border border-border p-2.5 text-xs">
          <span className="font-medium">{item.kind}</span>
          <span className="ml-2 text-muted-foreground">{item.createdAt}</span>
        </div>
      ))}
      {actions.map((action) => (
        <div key={action.id} className="rounded-md border border-border p-2.5 text-xs">
          <span className="font-medium">{action.action}</span>
          <span className="ml-2 text-muted-foreground">{action.state}</span>
        </div>
      ))}
    </div>
  )
}

function InspectorField(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {props.label}
      </h4>
      <div>{props.children}</div>
    </div>
  )
}

function EmptyInspectorText({ text }: { text: string }): React.JSX.Element {
  return <p className="py-8 text-center text-xs text-muted-foreground">{text}</p>
}

export function getInspectorTaskTitle(task: OrchestrationRunConsoleTask): string {
  return getRunConsoleTaskTitle(task)
}
