import React from 'react'
import type { OrchestrationRunConsoleSnapshot } from '../../../../shared/orchestration-run-console'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  focusAdjacentRunConsoleTask,
  getRunConsoleTaskAttentionCount,
  getRunConsoleTaskStatusLabel,
  getRunConsoleTaskTitle
} from './run-console-task-presentation'

type RunConsoleTaskOutlineProps = {
  snapshot: OrchestrationRunConsoleSnapshot
  orderedTaskIds: readonly string[]
  selectedTaskId: string | null
  reducedMotion: boolean
  onSelectTask: (taskId: string) => void
}

export function RunConsoleTaskOutline(props: RunConsoleTaskOutlineProps): React.JSX.Element {
  const taskById = new Map(props.snapshot.tasks.map((task) => [task.id, task]))
  return (
    <div
      className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3"
      aria-label={translate('auto.runConsole.outline.label', 'Task dependency outline')}
      data-run-console-task-collection
    >
      <div className="space-y-1">
        {props.orderedTaskIds.map((taskId, index) => {
          const task = taskById.get(taskId)
          if (!task) {
            return null
          }
          const selected = task.id === props.selectedTaskId
          const attentionCount = getRunConsoleTaskAttentionCount(props.snapshot, task.id)
          return (
            <button
              key={`${task.id}:${index}`}
              type="button"
              data-run-console-task-id={task.id}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'w-full rounded-md border border-transparent px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                !props.reducedMotion && 'transition-colors',
                selected ? 'border-border bg-accent' : 'hover:bg-accent/50'
              )}
              onClick={() => props.onSelectTask(task.id)}
              onKeyDown={(event) =>
                focusAdjacentRunConsoleTask(
                  event,
                  props.orderedTaskIds,
                  task.id,
                  props.onSelectTask
                )
              }
            >
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {getRunConsoleTaskTitle(task)}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {task.dependencyIds.length > 0
                      ? translate('auto.runConsole.outline.dependsOn', 'Depends on {{value0}}', {
                          value0: task.dependencyIds.join(', ')
                        })
                      : translate('auto.runConsole.outline.rootTask', 'Root task')}
                  </span>
                </span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {getRunConsoleTaskStatusLabel(task.status)}
                </Badge>
                {attentionCount > 0 ? (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {translate('auto.runConsole.graph.attentionCount', '{{value0}} attention', {
                      value0: attentionCount
                    })}
                  </Badge>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
