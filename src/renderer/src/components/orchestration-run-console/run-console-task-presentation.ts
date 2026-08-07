import type {
  OrchestrationRunConsoleSnapshot,
  OrchestrationRunConsoleTask
} from '../../../../shared/orchestration-run-console'
import { translate } from '@/i18n/i18n'

export function getRunConsoleTaskTitle(task: OrchestrationRunConsoleTask): string {
  return task.displayName ?? task.title
}

export function getRunConsoleTaskStatusLabel(
  status: OrchestrationRunConsoleTask['status']
): string {
  const labels: Record<OrchestrationRunConsoleTask['status'], string> = {
    pending: translate('auto.runConsole.task.status.pending', 'Pending'),
    ready: translate('auto.runConsole.task.status.ready', 'Ready'),
    dispatched: translate('auto.runConsole.task.status.dispatched', 'Dispatched'),
    completed: translate('auto.runConsole.task.status.completed', 'Completed'),
    failed: translate('auto.runConsole.task.status.failed', 'Failed'),
    blocked: translate('auto.runConsole.task.status.blocked', 'Blocked')
  }
  return labels[status]
}

export function getRunConsoleTaskAttentionCount(
  snapshot: OrchestrationRunConsoleSnapshot,
  taskId: string
): number {
  return snapshot.attention.filter((item) => item.taskId === taskId).length
}

export function focusAdjacentRunConsoleTask(
  event: React.KeyboardEvent<HTMLButtonElement>,
  orderedTaskIds: readonly string[],
  selectedTaskId: string,
  onSelectTask: (taskId: string) => void
): void {
  const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
    return
  }
  event.preventDefault()
  const currentIndex = orderedTaskIds.indexOf(selectedTaskId)
  const nextIndex = Math.max(0, Math.min(orderedTaskIds.length - 1, currentIndex + delta))
  const nextTaskId = orderedTaskIds[nextIndex]
  if (!nextTaskId) {
    return
  }
  onSelectTask(nextTaskId)
  event.currentTarget
    .closest('[data-run-console-task-collection]')
    ?.querySelector<HTMLButtonElement>(`[data-run-console-task-id="${CSS.escape(nextTaskId)}"]`)
    ?.focus()
}
