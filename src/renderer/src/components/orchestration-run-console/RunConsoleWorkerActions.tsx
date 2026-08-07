import React, { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  OrchestrationRunConsoleDispatch,
  OrchestrationRunConsoleTask,
  OrchestrationRunConsoleWorker
} from '../../../../shared/orchestration-run-console'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { RunConsoleOperatorFeedback } from './RunConsoleOperatorFeedback'
import type { RunConsoleOperatorCall } from './run-console-operator-types'
import { useRunConsoleOperatorSubmit } from './use-run-console-operator-submit'

type WorkerAction = 'stop' | 'abandon' | 'release' | 'retain'

export type RunConsoleWorkerActionAvailability = Record<'followup' | WorkerAction, boolean>

export function getRunConsoleWorkerActionAvailability(args: {
  worker: OrchestrationRunConsoleWorker
  dispatch: OrchestrationRunConsoleDispatch
  legacyReadOnly: boolean
  staleIdentity: boolean
}): RunConsoleWorkerActionAvailability {
  if (args.legacyReadOnly || args.staleIdentity) {
    return { followup: false, stop: false, abandon: false, release: false, retain: false }
  }
  const terminalWorker = ['succeeded', 'stopped', 'abandoned'].includes(args.worker.workerState)
  const resourceAvailable =
    Boolean(args.worker.resource) &&
    !['releasing', 'released'].includes(args.worker.resource?.releaseState ?? '')
  return {
    followup: args.dispatch.status === 'dispatched' && !terminalWorker,
    stop: ['starting', 'ready'].includes(args.worker.workerState),
    abandon: !terminalWorker,
    release: resourceAvailable && !args.worker.federation,
    retain: resourceAvailable
  }
}

export function RunConsoleWorkerActions(props: {
  runId: string
  task: OrchestrationRunConsoleTask
  dispatch: OrchestrationRunConsoleDispatch
  worker: OrchestrationRunConsoleWorker
  targetLabel: string
  legacyReadOnly: boolean
  staleIdentity: boolean
  callOperator?: RunConsoleOperatorCall
  disabled?: boolean
}): React.JSX.Element {
  const [followup, setFollowup] = useState('')
  const [confirmAction, setConfirmAction] = useState<WorkerAction | null>(null)
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null)
  const submit = useRunConsoleOperatorSubmit(
    `${props.runId}:${props.task.id}:${props.dispatch.id}`,
    props.callOperator
  )
  const availability = getRunConsoleWorkerActionAvailability(props)
  const busy = submit.phase === 'pending' || submit.phase === 'unknown'
  const disabled = !props.callOperator || busy || props.disabled === true

  const sendFollowup = async (): Promise<void> => {
    const body = followup.trim()
    if (!body) {
      return
    }
    const completed = await submit.submit('orchestration.consoleSendFollowup', {
      run: props.runId,
      dispatch: props.dispatch.id,
      body
    })
    if (completed) {
      setFollowup('')
    }
  }
  const runWorkerAction = async (): Promise<void> => {
    if (!confirmAction) {
      return
    }
    const completed = await submit.submit(WORKER_ACTION_METHODS[confirmAction], {
      run: props.runId,
      dispatch: props.dispatch.id
    })
    if (completed) {
      closeConfirmation()
    }
  }
  const closeConfirmation = (): void => {
    setConfirmAction(null)
    queueMicrotask(() => confirmationTriggerRef.current?.focus())
  }

  return (
    <section
      className="space-y-3 border-t border-border pt-3"
      aria-label={translate('auto.runConsole.actions.workerControls', 'Worker controls')}
    >
      <p className="truncate font-mono text-[10px] text-muted-foreground">
        {props.targetLabel} · {props.runId} · {props.task.id} · {props.dispatch.id}
      </p>
      <div className="space-y-2">
        <label
          className="text-[11px] font-medium text-muted-foreground"
          htmlFor={`run-console-followup-${props.dispatch.id}`}
        >
          {translate('auto.runConsole.actions.followup', 'Exact-dispatch follow-up')}
        </label>
        <textarea
          id={`run-console-followup-${props.dispatch.id}`}
          value={followup}
          onChange={(event) => setFollowup(event.target.value)}
          maxLength={4_000}
          disabled={disabled || !availability.followup}
          className="min-h-16 w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={disabled || !availability.followup || !followup.trim()}
          onClick={() => void sendFollowup()}
        >
          {translate('auto.runConsole.actions.sendFollowup', 'Send follow-up')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['stop', 'abandon', 'release', 'retain'] as const).map((action) => (
          <Button
            key={action}
            size="sm"
            variant={action === 'abandon' || action === 'release' ? 'destructive' : 'outline'}
            className="h-7 text-xs"
            disabled={disabled || !availability[action]}
            onClick={(event) => {
              confirmationTriggerRef.current = event.currentTarget
              setConfirmAction(action)
            }}
          >
            {getWorkerActionLabel(action)}
          </Button>
        ))}
      </div>
      {props.disabled ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.runConsole.actions.staleSnapshot',
            'Refresh current runtime data before taking an action.'
          )}
        </p>
      ) : props.staleIdentity ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.runConsole.actions.staleWorker',
            'This worker is not the task’s latest dispatch. Controls are disabled.'
          )}
        </p>
      ) : props.legacyReadOnly ? (
        <p className="text-[11px] text-muted-foreground">
          {translate('auto.runConsole.actions.readOnly', 'Action unavailable for this run.')}
        </p>
      ) : props.worker.federation && !availability.release ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.runConsole.actions.federatedRelease',
            'Release is unavailable because the connected worker runtime owns this resource.'
          )}
        </p>
      ) : null}
      <RunConsoleOperatorFeedback state={submit} onRetry={() => void submit.retry()} />
      <WorkerActionDialog
        action={confirmAction}
        targetLabel={props.targetLabel}
        runId={props.runId}
        taskId={props.task.id}
        dispatchId={props.dispatch.id}
        busy={submit.phase === 'pending'}
        onOpenChange={(open) => !open && closeConfirmation()}
        onConfirm={() => void runWorkerAction()}
      />
    </section>
  )
}

const WORKER_ACTION_METHODS: Record<WorkerAction, string> = {
  stop: 'orchestration.consoleStopWorker',
  abandon: 'orchestration.consoleAbandonWorker',
  release: 'orchestration.consoleReleaseWorker',
  retain: 'orchestration.consoleRetainWorker'
}

function WorkerActionDialog(props: {
  action: WorkerAction | null
  targetLabel: string
  runId: string
  taskId: string
  dispatchId: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}): React.JSX.Element {
  const copy = props.action ? WORKER_ACTION_COPY[props.action] : WORKER_ACTION_COPY.stop
  return (
    <Dialog
      open={Boolean(props.action)}
      onOpenChange={(open) => !props.busy && props.onOpenChange(open)}
    >
      <DialogContent showCloseButton={false} className="max-w-sm sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{copy.title}</DialogTitle>
          <DialogDescription className="text-xs">{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          <div>{props.targetLabel}</div>
          <div>{props.runId}</div>
          <div>{props.taskId}</div>
          <div>{props.dispatchId}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={props.busy} onClick={() => props.onOpenChange(false)}>
            {translate('auto.runConsole.actions.cancel', 'Cancel')}
          </Button>
          <Button
            variant={
              props.action === 'abandon' || props.action === 'release' ? 'destructive' : 'default'
            }
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getWorkerActionLabel(action: WorkerAction): string {
  return WORKER_ACTION_COPY[action].label
}

const WORKER_ACTION_COPY: Record<
  WorkerAction,
  { label: string; title: string; description: string; confirm: string }
> = {
  stop: {
    label: translate('auto.runConsole.actions.stop', 'Stop'),
    title: translate('auto.runConsole.actions.stopTitle', 'Stop this exact worker?'),
    description: translate(
      'auto.runConsole.actions.stopDescription',
      'Requests a graceful stop and preserves recoverable task and resource state.'
    ),
    confirm: translate('auto.runConsole.actions.confirmStop', 'Stop worker')
  },
  abandon: {
    label: translate('auto.runConsole.actions.abandon', 'Abandon'),
    title: translate('auto.runConsole.actions.abandonTitle', 'Abandon this exact worker?'),
    description: translate(
      'auto.runConsole.actions.abandonDescription',
      'Marks the dispatch abandoned without claiming that its process or resources were cleaned up.'
    ),
    confirm: translate('auto.runConsole.actions.confirmAbandon', 'Abandon worker')
  },
  release: {
    label: translate('auto.runConsole.actions.release', 'Release'),
    title: translate('auto.runConsole.actions.releaseTitle', 'Release this worker resource?'),
    description: translate(
      'auto.runConsole.actions.releaseDescription',
      'Runs the existing cleanup contract and preserves bounded output evidence when supported.'
    ),
    confirm: translate('auto.runConsole.actions.confirmRelease', 'Release resource')
  },
  retain: {
    label: translate('auto.runConsole.actions.retain', 'Retain'),
    title: translate('auto.runConsole.actions.retainTitle', 'Retain this worker resource?'),
    description: translate(
      'auto.runConsole.actions.retainDescription',
      'Keeps the resource available and records the operator decision.'
    ),
    confirm: translate('auto.runConsole.actions.confirmRetain', 'Retain resource')
  }
}
