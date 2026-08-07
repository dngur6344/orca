import React from 'react'
import { AlertCircle, CircleHelp, GitPullRequestArrow, ShieldQuestion } from 'lucide-react'
import type {
  OrchestrationRunConsoleAttentionItem,
  OrchestrationRunConsoleSnapshot
} from '../../../../shared/orchestration-run-console'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { RunConsoleGateAction } from './RunConsoleGateAction'
import type { RunConsoleOperatorCall } from './run-console-operator-types'
import { RunConsoleQuestionAction } from './RunConsoleQuestionAction'

type RunConsoleAttentionQueueProps = {
  snapshot: OrchestrationRunConsoleSnapshot | null
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
  callOperator?: RunConsoleOperatorCall
  targetLabel?: string
  actionsDisabled?: boolean
}

const ATTENTION_ICONS = {
  question: CircleHelp,
  gate: ShieldQuestion,
  failure: AlertCircle,
  resource: GitPullRequestArrow
} as const

export function RunConsoleAttentionQueue(props: RunConsoleAttentionQueueProps): React.JSX.Element {
  const items = props.snapshot?.attention ?? []
  const selectedActionItem = items.find(
    (item) =>
      item.taskId === props.selectedTaskId && (item.kind === 'question' || item.kind === 'gate')
  )
  const selectedQuestion = props.snapshot?.questions.find(
    (question) => `question:${question.messageId}` === selectedActionItem?.id
  )
  const selectedGate = props.snapshot?.gates.find(
    (gate) => `gate:${gate.id}` === selectedActionItem?.id
  )
  return (
    <section className="border-b border-border" aria-labelledby="run-console-attention-heading">
      <div className="flex h-10 items-center gap-2 px-4">
        <h2 id="run-console-attention-heading" className="text-xs font-semibold">
          {translate('auto.runConsole.attention.title', 'Needs attention')}
        </h2>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {props.snapshot
            ? translate('auto.runConsole.attention.empty', 'No items need attention.')
            : translate(
                'auto.runConsole.attention.selectRun',
                'Select a run to inspect attention.'
              )}
        </p>
      ) : (
        <div className="scrollbar-sleek flex max-h-40 gap-2 overflow-x-auto border-t border-border p-2">
          {items.map((item) => (
            <AttentionItem
              key={item.id}
              item={item}
              snapshot={props.snapshot!}
              selected={item.taskId === props.selectedTaskId}
              onSelectTask={props.onSelectTask}
            />
          ))}
        </div>
      )}
      {selectedActionItem?.kind === 'question' && selectedQuestion ? (
        <div className="border-t border-border p-2">
          <RunConsoleQuestionAction
            question={selectedQuestion}
            runId={props.snapshot!.run.id}
            targetLabel={props.targetLabel ?? props.snapshot!.run.id}
            disabled={props.snapshot!.run.legacyReadOnly || props.actionsDisabled === true}
            callOperator={props.callOperator}
          />
        </div>
      ) : selectedActionItem?.kind === 'gate' && selectedGate ? (
        <div className="border-t border-border p-2">
          <RunConsoleGateAction
            gate={selectedGate}
            runId={props.snapshot!.run.id}
            targetLabel={props.targetLabel ?? props.snapshot!.run.id}
            disabled={props.snapshot!.run.legacyReadOnly || props.actionsDisabled === true}
            callOperator={props.callOperator}
          />
        </div>
      ) : null}
    </section>
  )
}

function AttentionItem(props: {
  item: OrchestrationRunConsoleAttentionItem
  snapshot: OrchestrationRunConsoleSnapshot
  selected: boolean
  onSelectTask: (taskId: string) => void
}): React.JSX.Element {
  const Icon = ATTENTION_ICONS[props.item.kind]
  const presentation = getAttentionPresentation(props.item, props.snapshot)
  return (
    <button
      type="button"
      className={cn(
        'min-w-52 max-w-72 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        props.selected && 'bg-accent'
      )}
      disabled={!props.item.taskId}
      onClick={() => props.item.taskId && props.onSelectTask(props.item.taskId)}
      aria-current={props.selected ? 'true' : undefined}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {presentation.label}
      </span>
      <span className="mt-1 block truncate text-xs font-medium">{presentation.title}</span>
      <span className="mt-1 block truncate text-[11px] text-muted-foreground">
        {presentation.taskTitle}
      </span>
    </button>
  )
}

function getAttentionPresentation(
  item: OrchestrationRunConsoleAttentionItem,
  snapshot: OrchestrationRunConsoleSnapshot
): { label: string; title: string; taskTitle: string } {
  const task = snapshot.tasks.find((candidate) => candidate.id === item.taskId)
  const taskTitle = task?.displayName ?? task?.title ?? item.taskId ?? item.runId
  if (item.kind === 'question') {
    const question = snapshot.questions.find(
      (candidate) => `question:${candidate.messageId}` === item.id
    )
    return {
      label: translate('auto.runConsole.attention.question', 'Question'),
      title:
        question?.prompt ??
        translate('auto.runConsole.attention.questionFallback', 'Answer required'),
      taskTitle
    }
  }
  if (item.kind === 'gate') {
    const gate = snapshot.gates.find((candidate) => `gate:${candidate.id}` === item.id)
    return {
      label: translate('auto.runConsole.attention.gate', 'Decision gate'),
      title:
        gate?.question ?? translate('auto.runConsole.attention.gateFallback', 'Decision required'),
      taskTitle
    }
  }
  if (item.kind === 'failure') {
    return {
      label: translate('auto.runConsole.attention.failure', 'Failure'),
      title: translate('auto.runConsole.attention.failureTitle', 'Review the failed attempt'),
      taskTitle
    }
  }
  return {
    label: translate('auto.runConsole.attention.resource', 'Resource decision'),
    title: translate('auto.runConsole.attention.resourceTitle', 'Release or retain the resource'),
    taskTitle
  }
}
