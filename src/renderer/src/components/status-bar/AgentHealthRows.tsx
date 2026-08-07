import type { AgentHealthCheckId, AgentHealthSnapshot } from '../../../../shared/agent-health'
import type { StatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'
import { translate } from '@/i18n/i18n'
import { formatTimeAgo } from './tooltip'
import type { AgentReadinessState } from './agent-readiness'

function healthLabel(state: AgentReadinessState): string {
  switch (state) {
    case 'ready':
      return translate('auto.components.status.bar.AgentHealthRows.healthy', 'Healthy')
    case 'checking':
      return translate('auto.components.status.bar.AgentHealthRows.checking', 'Checking')
    case 'action-required':
      return translate(
        'auto.components.status.bar.AgentHealthRows.actionRequired',
        'Action required'
      )
    case 'degraded':
      return translate('auto.components.status.bar.AgentHealthRows.degraded', 'Degraded')
    case 'unavailable':
      return translate('auto.components.status.bar.AgentHealthRows.unavailable', 'Unavailable')
    case 'unknown':
      return translate('auto.components.status.bar.AgentHealthRows.unknown', 'Unknown')
  }
}

function cliStatusLabel(snapshot: AgentHealthSnapshot | null, pending: boolean): string {
  if (!snapshot) {
    return pending
      ? translate('auto.components.status.bar.AgentHealthRows.checking', 'Checking')
      : translate('auto.components.status.bar.AgentHealthRows.notChecked', 'Not checked')
  }
  return snapshot.cliStatus === 'available'
    ? translate('auto.components.status.bar.AgentHealthRows.available', 'Available')
    : translate('auto.components.status.bar.AgentHealthRows.unavailable', 'Unavailable')
}

function checkLabel(id: AgentHealthCheckId): string {
  switch (id) {
    case 'cli':
      return translate('auto.components.status.bar.AgentHealthRows.cli', 'CLI')
    case 'authentication':
      return translate(
        'auto.components.status.bar.AgentHealthRows.authentication',
        'Authentication'
      )
    case 'provider':
      return translate('auto.components.status.bar.AgentHealthRows.provider', 'Provider')
    case 'websocket':
      return translate('auto.components.status.bar.AgentHealthRows.websocket', 'WebSocket')
  }
}

function checkStatusLabel(status: AgentHealthSnapshot['checks'][number]['status']): string {
  switch (status) {
    case 'ok':
      return translate('auto.components.status.bar.AgentHealthRows.passed', 'Passed')
    case 'warning':
      return translate('auto.components.status.bar.AgentHealthRows.warning', 'Warning')
    case 'failed':
      return translate('auto.components.status.bar.AgentHealthRows.failed', 'Failed')
  }
}

function checkDotClass(status: AgentHealthSnapshot['checks'][number]['status']): string {
  if (status === 'ok') {
    return 'bg-status-success'
  }
  return status === 'warning' ? 'bg-yellow-500' : 'bg-destructive'
}

export function AgentHealthRows({
  snapshot,
  connectionState,
  pending,
  mode
}: {
  snapshot: AgentHealthSnapshot | null
  connectionState: AgentReadinessState
  pending: boolean
  mode: StatusBarUsageMode
}): React.JSX.Element {
  const checked = snapshot ? formatTimeAgo(snapshot.checkedAt) : null
  return (
    <div className="px-3.5 pb-1.5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-secondary/60 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {translate('auto.components.status.bar.AgentHealthRows.status', 'Status')}
          </span>
          <span className="text-[10px] font-medium text-foreground">
            {cliStatusLabel(snapshot, pending)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {translate('auto.components.status.bar.AgentHealthRows.health', 'Health')}
          </span>
          <span className="text-[10px] font-medium text-foreground">
            {healthLabel(connectionState)}
          </span>
        </div>
        {snapshot?.version ? (
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>v{snapshot.version}</span>
            <span aria-hidden="true">·</span>
            <span>
              {translate(
                'auto.components.status.bar.AgentHealthRows.probeDuration',
                '{{value0}} ms',
                { value0: snapshot.durationMs }
              )}
            </span>
            {checked ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{checked}</span>
              </>
            ) : null}
          </div>
        ) : null}
        {mode === 'verbose' && snapshot ? (
          <div className="col-span-2 mt-0.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/70 pt-1.5">
            {snapshot.checks.map((check) => (
              <span
                key={check.id}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              >
                <span className={`size-1.5 rounded-full ${checkDotClass(check.status)}`} />
                {checkLabel(check.id)}: {checkStatusLabel(check.status)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
