import React from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

type RunConsolePageHeaderProps = {
  targetKey: string
  environments: { id: string; name: string }[]
  refreshDisabled: boolean
  refreshing: boolean
  onTargetChange: (key: string) => void
  onRefresh: () => void
  onClose: () => void
}

export function RunConsolePageHeader(props: RunConsolePageHeaderProps): React.JSX.Element {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <div>
        <h1 className="text-sm font-semibold">{translate('auto.runConsole.title', 'Runs')}</h1>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          {translate('auto.runConsole.subtitle', 'Supervise objectives and attention')}
        </p>
      </div>
      <Select value={props.targetKey} onValueChange={props.onTargetChange}>
        <SelectTrigger
          className="ml-auto h-8 w-36 sm:w-52"
          aria-label={translate('auto.runConsole.runtime.label', 'Run runtime')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="local">
            {translate('auto.runConsole.runtime.local', 'Local runtime')}
          </SelectItem>
          {props.environments.map((environment) => (
            <SelectItem key={environment.id} value={`environment:${environment.id}`}>
              {environment.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={props.onRefresh}
        aria-label={translate('auto.runConsole.refresh', 'Refresh runs')}
        disabled={props.refreshDisabled}
      >
        <RefreshCw className={props.refreshing ? 'size-4 animate-spin' : 'size-4'} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={props.onClose}
        aria-label={translate('auto.runConsole.close', 'Close Runs')}
      >
        <X className="size-4" />
      </Button>
    </header>
  )
}
