import React from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RunConsoleOperatorSubmitState } from './use-run-console-operator-submit'

export function RunConsoleOperatorFeedback(props: {
  state: RunConsoleOperatorSubmitState
  onRetry: () => void
}): React.JSX.Element | null {
  if (
    props.state.phase === 'idle' ||
    (props.state.phase === 'pending' && !props.state.showProgress)
  ) {
    return null
  }
  if (props.state.phase === 'pending') {
    return (
      <p role="status" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {translate('auto.runConsole.actions.pending', 'Waiting for the runtime…')}
      </p>
    )
  }
  if (props.state.phase === 'unknown') {
    return (
      <div role="status" className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
        <p className="font-medium">
          {translate('auto.runConsole.actions.unknown', 'Outcome unknown')}
        </p>
        <p className="mt-1 text-muted-foreground">
          {props.state.message ??
            translate(
              'auto.runConsole.actions.unknownDescription',
              'Inspect the latest audit state, then retry with the same request ID.'
            )}
        </p>
        <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={props.onRetry}>
          <RotateCcw className="size-3" />
          {translate('auto.runConsole.actions.retry', 'Retry safely')}
        </Button>
      </div>
    )
  }
  if (props.state.phase === 'error') {
    return (
      <p role="alert" className="text-[11px] text-destructive">
        {props.state.message}
      </p>
    )
  }
  return (
    <p role="status" className="text-[11px] text-muted-foreground">
      {props.state.replayed
        ? translate(
            'auto.runConsole.actions.replayed',
            'Confirmed from the existing request record.'
          )
        : translate('auto.runConsole.actions.completed', 'Action completed.')}
    </p>
  )
}
