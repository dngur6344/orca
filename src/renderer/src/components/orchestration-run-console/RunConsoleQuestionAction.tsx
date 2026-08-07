import React, { useState } from 'react'
import type { OrchestrationRunConsoleQuestion } from '../../../../shared/orchestration-run-console'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { RunConsoleOperatorFeedback } from './RunConsoleOperatorFeedback'
import type { RunConsoleOperatorCall } from './run-console-operator-types'
import { useRunConsoleOperatorSubmit } from './use-run-console-operator-submit'

export function RunConsoleQuestionAction(props: {
  question: OrchestrationRunConsoleQuestion
  runId: string
  targetLabel: string
  disabled: boolean
  callOperator?: RunConsoleOperatorCall
}): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const submit = useRunConsoleOperatorSubmit(
    `${props.runId}:question:${props.question.messageId}`,
    props.callOperator
  )
  const unavailable = props.disabled || props.question.status !== 'pending' || !props.callOperator
  const busy = submit.phase === 'pending' || submit.phase === 'unknown'
  const answerQuestion = async (): Promise<void> => {
    const body = answer.trim()
    if (!body) {
      return
    }
    await submit.submit('orchestration.consoleReply', {
      run: props.runId,
      question: props.question.messageId,
      body
    })
  }
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
      <p className="text-xs font-medium">{props.question.prompt}</p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">
        {props.targetLabel} · {props.runId} · {props.question.taskId ?? '—'} ·{' '}
        {props.question.dispatchId}
      </p>
      {props.question.options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {props.question.options.map((option) => (
            <Button
              key={option}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={unavailable || busy}
              onClick={() => setAnswer(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : null}
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        maxLength={4_000}
        disabled={unavailable || busy}
        aria-label={translate('auto.runConsole.actions.answerLabel', 'Answer')}
        className={cn(
          'min-h-16 w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
          unavailable && 'opacity-60'
        )}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={unavailable || busy || !answer.trim()}
          onClick={() => void answerQuestion()}
        >
          {translate('auto.runConsole.actions.sendAnswer', 'Send answer')}
        </Button>
        {unavailable ? (
          <span className="text-[11px] text-muted-foreground">
            {translate('auto.runConsole.actions.readOnly', 'Action unavailable for this run.')}
          </span>
        ) : null}
      </div>
      <RunConsoleOperatorFeedback state={submit} onRetry={() => void submit.retry()} />
    </div>
  )
}
