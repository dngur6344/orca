import React from 'react'
import type { OrchestrationRunConsoleSnapshot } from '../../../../shared/orchestration-run-console'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { RunConsoleTaskLayout } from './run-console-task-layout'
import {
  focusAdjacentRunConsoleTask,
  getRunConsoleTaskAttentionCount,
  getRunConsoleTaskStatusLabel,
  getRunConsoleTaskTitle
} from './run-console-task-presentation'

type RunConsoleTaskGraphProps = {
  snapshot: OrchestrationRunConsoleSnapshot
  layout: RunConsoleTaskLayout
  selectedTaskId: string | null
  reducedMotion: boolean
  onSelectTask: (taskId: string) => void
}

export function RunConsoleTaskGraph(props: RunConsoleTaskGraphProps): React.JSX.Element {
  const taskById = new Map(props.snapshot.tasks.map((task) => [task.id, task]))
  return (
    <div
      className="scrollbar-sleek min-h-0 flex-1 overflow-auto"
      aria-label={translate('auto.runConsole.graph.label', 'Task dependency graph')}
    >
      <div
        className="relative"
        style={{ width: props.layout.width, height: props.layout.height }}
        data-run-console-task-collection
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-border"
          width={props.layout.width}
          height={props.layout.height}
        >
          {props.layout.edges.map((edge) => (
            <path key={edge.id} d={edge.path} fill="none" stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>
        {props.layout.nodes.map((node) => {
          const task = taskById.get(node.taskId)
          if (!task) {
            return null
          }
          const selected = task.id === props.selectedTaskId
          const attentionCount = getRunConsoleTaskAttentionCount(props.snapshot, task.id)
          const dependencyCount = task.dependencyIds.length
          return (
            <button
              key={task.id}
              type="button"
              data-run-console-task-id={task.id}
              aria-current={selected ? 'true' : undefined}
              aria-label={translate(
                'auto.runConsole.graph.taskLabel',
                '{{value0}}, {{value1}}, {{value2}} dependencies',
                {
                  value0: getRunConsoleTaskTitle(task),
                  value1: getRunConsoleTaskStatusLabel(task.status),
                  value2: dependencyCount
                }
              )}
              className={cn(
                'absolute rounded-lg border bg-card p-3 text-left shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                !props.reducedMotion && 'transition-colors',
                selected ? 'border-foreground/30 bg-accent' : 'border-border hover:bg-accent/50'
              )}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
              onClick={() => props.onSelectTask(task.id)}
              onKeyDown={(event) =>
                focusAdjacentRunConsoleTask(
                  event,
                  props.layout.orderedTaskIds,
                  task.id,
                  props.onSelectTask
                )
              }
            >
              <span className="block truncate text-xs font-medium">
                {getRunConsoleTaskTitle(task)}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{getRunConsoleTaskStatusLabel(task.status)}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate font-mono">{task.id}</span>
              </span>
              {attentionCount > 0 ? (
                <Badge
                  variant="outline"
                  className="absolute right-2 bottom-2 px-1.5 py-0 text-[10px]"
                >
                  {translate('auto.runConsole.graph.attentionCount', '{{value0}} attention', {
                    value0: attentionCount
                  })}
                </Badge>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
