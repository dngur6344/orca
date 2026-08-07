import React, { useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { OrchestrationRunConsoleRunSummary } from '../../../../shared/orchestration-run-console'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  groupRunConsoleRuns,
  type RunConsoleRunFilter,
  type RunConsoleRunGroupId
} from './run-console-run-groups'

type RunConsoleRunListProps = {
  runs: OrchestrationRunConsoleRunSummary[]
  selectedRunId: string | null
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onSelect: (runId: string) => void
  onLoadMore: () => void
}

export function RunConsoleRunList(props: RunConsoleRunListProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RunConsoleRunFilter>('all')
  const groups = useMemo(
    () => groupRunConsoleRuns(props.runs, query, filter),
    [filter, props.runs, query]
  )
  const visibleCount = groups.reduce((count, group) => count + group.runs.length, 0)

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-b border-border bg-muted/20 md:border-r md:border-b-0">
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('auto.runConsole.runList.search', 'Search runs')}
            aria-label={translate('auto.runConsole.runList.search', 'Search runs')}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as RunConsoleRunFilter)}>
          <SelectTrigger
            className="h-8 w-full text-xs"
            aria-label={translate('auto.runConsole.runList.filter', 'Filter runs')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('auto.runConsole.runList.filterAll', 'All states')}
            </SelectItem>
            <SelectItem value="needs_attention">
              {translate('auto.runConsole.runList.groupAttention', 'Needs attention')}
            </SelectItem>
            <SelectItem value="active">
              {translate('auto.runConsole.runList.groupActive', 'Active')}
            </SelectItem>
            <SelectItem value="completed">
              {translate('auto.runConsole.runList.groupCompleted', 'Completed')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-2">
        {props.loading && props.runs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {translate('auto.runConsole.runList.loading', 'Loading runs…')}
          </div>
        ) : visibleCount === 0 ? (
          <p className="px-2 py-10 text-center text-xs text-muted-foreground">
            {props.runs.length === 0
              ? translate('auto.runConsole.runList.empty', 'No orchestration runs yet.')
              : translate('auto.runConsole.runList.noMatches', 'No runs match this search.')}
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) =>
              group.runs.length > 0 ? (
                <section key={group.id} aria-labelledby={`run-group-${group.id}`}>
                  <div className="mb-1 flex items-center px-2">
                    <h2
                      id={`run-group-${group.id}`}
                      className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase"
                    >
                      {getGroupLabel(group.id)}
                    </h2>
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {group.runs.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.runs.map((run) => (
                      <RunRow
                        key={run.id}
                        run={run}
                        selected={run.id === props.selectedRunId}
                        onSelect={props.onSelect}
                      />
                    ))}
                  </div>
                </section>
              ) : null
            )}
          </div>
        )}
        {props.hasMore && !query && filter === 'all' ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-xs"
            disabled={props.loadingMore}
            onClick={props.onLoadMore}
          >
            {props.loadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {translate('auto.runConsole.runList.loadMore', 'Load more')}
          </Button>
        ) : null}
      </div>
    </aside>
  )
}

function RunRow(props: {
  run: OrchestrationRunConsoleRunSummary
  selected: boolean
  onSelect: (runId: string) => void
}): React.JSX.Element {
  const attentionCount =
    props.run.counts.pendingQuestions +
    props.run.counts.pendingGates +
    props.run.counts.failedTasks +
    props.run.counts.circuitBrokenDispatches +
    props.run.counts.resourceDecisions
  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.run.id)}
      aria-current={props.selected ? 'true' : undefined}
      data-current={props.selected ? 'true' : undefined}
      className={cn(
        'w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        props.selected && 'bg-accent'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {props.run.objective}
        </span>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {getStateLabel(props.run)}
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate font-mono">{props.run.id}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {attentionCount > 0
            ? translate('auto.runConsole.runList.attentionCount', '{{value0}} attention', {
                value0: attentionCount
              })
            : translate('auto.runConsole.runList.taskCount', '{{value0}}/{{value1}} tasks', {
                value0: props.run.counts.terminalTasks,
                value1: props.run.counts.tasks
              })}
        </span>
      </div>
    </button>
  )
}

function getGroupLabel(group: RunConsoleRunGroupId): string {
  if (group === 'needs_attention') {
    return translate('auto.runConsole.runList.groupAttention', 'Needs attention')
  }
  if (group === 'active') {
    return translate('auto.runConsole.runList.groupActive', 'Active')
  }
  return translate('auto.runConsole.runList.groupCompleted', 'Completed')
}

function getStateLabel(run: OrchestrationRunConsoleRunSummary): string {
  if (run.legacyReadOnly) {
    return translate('auto.runConsole.runList.stateReadOnly', 'Read-only')
  }
  if (run.state === 'needs_attention') {
    return translate('auto.runConsole.runList.stateAttention', 'Attention')
  }
  if (run.state === 'active') {
    return translate('auto.runConsole.runList.groupActive', 'Active')
  }
  if (run.state === 'completed') {
    return translate('auto.runConsole.runList.groupCompleted', 'Completed')
  }
  return translate('auto.runConsole.runList.stateUnknown', 'Unknown')
}
