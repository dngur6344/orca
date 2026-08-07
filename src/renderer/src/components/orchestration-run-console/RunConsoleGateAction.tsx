import React, { useState } from 'react'
import type { OrchestrationRunConsoleGate } from '../../../../shared/orchestration-run-console'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { RunConsoleOperatorFeedback } from './RunConsoleOperatorFeedback'
import type { RunConsoleOperatorCall } from './run-console-operator-types'
import { useRunConsoleOperatorSubmit } from './use-run-console-operator-submit'

export function RunConsoleGateAction(props: {
  gate: OrchestrationRunConsoleGate
  runId: string
  targetLabel: string
  disabled: boolean
  callOperator?: RunConsoleOperatorCall
}): React.JSX.Element {
  const [resolution, setResolution] = useState('')
  const submit = useRunConsoleOperatorSubmit(
    `${props.runId}:gate:${props.gate.id}`,
    props.callOperator
  )
  const unavailable = props.disabled || props.gate.status !== 'pending' || !props.callOperator
  const busy = submit.phase === 'pending' || submit.phase === 'unknown'
  const resolveGate = async (): Promise<void> => {
    const value = resolution.trim()
    if (!value) {
      return
    }
    await submit.submit('orchestration.consoleResolveGate', {
      run: props.runId,
      gate: props.gate.id,
      resolution: value
    })
  }
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
      <p className="text-xs font-medium">{props.gate.question}</p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">
        {props.targetLabel} · {props.runId} · {props.gate.taskId}
      </p>
      {props.gate.options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {props.gate.options.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={resolution === option ? 'secondary' : 'outline'}
              className="h-7 text-xs"
              aria-pressed={resolution === option}
              disabled={unavailable || busy}
              onClick={() => setResolution(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : (
        <Input
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
          maxLength={1_000}
          disabled={unavailable || busy}
          aria-label={translate('auto.runConsole.actions.resolutionLabel', 'Resolution')}
          className="h-8 text-xs"
        />
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={unavailable || busy || !resolution.trim()}
          onClick={() => void resolveGate()}
        >
          {translate('auto.runConsole.actions.resolveGate', 'Resolve gate')}
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
