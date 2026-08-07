import type { OrchestrationRunConsoleTask } from '../../../../shared/orchestration-run-console'

export const RUN_CONSOLE_GRAPH_TASK_LIMIT = 80

const NODE_WIDTH = 208
const NODE_HEIGHT = 76
const LAYER_GAP = 72
const ROW_GAP = 24
const CANVAS_PADDING = 24

export type RunConsoleTaskLayoutFallback =
  | 'too_many_tasks'
  | 'duplicate_task'
  | 'missing_dependency'
  | 'cycle'

export type RunConsoleTaskLayoutNode = {
  taskId: string
  layer: number
  x: number
  y: number
  width: number
  height: number
}

export type RunConsoleTaskLayoutEdge = {
  id: string
  fromTaskId: string
  toTaskId: string
  path: string
}

export type RunConsoleTaskLayout = {
  mode: 'graph' | 'outline'
  fallback: RunConsoleTaskLayoutFallback | null
  orderedTaskIds: string[]
  nodes: RunConsoleTaskLayoutNode[]
  edges: RunConsoleTaskLayoutEdge[]
  width: number
  height: number
}

export function layoutRunConsoleTasks(
  tasks: readonly OrchestrationRunConsoleTask[]
): RunConsoleTaskLayout {
  const stableTasks = [...tasks].sort(compareTasks)
  const stableIds = stableTasks.map((task) => task.id)
  if (stableTasks.length > RUN_CONSOLE_GRAPH_TASK_LIMIT) {
    return outlineLayout(stableIds, 'too_many_tasks')
  }

  const taskById = new Map(stableTasks.map((task) => [task.id, task]))
  if (taskById.size !== stableTasks.length) {
    return outlineLayout(stableIds, 'duplicate_task')
  }
  if (
    stableTasks.some(
      (task) =>
        !Array.isArray(task.dependencyIds) ||
        !task.dependenciesValid ||
        parseDependencyIds(task.dependencyIds).some((dependencyId) => !taskById.has(dependencyId))
    )
  ) {
    return outlineLayout(stableIds, 'missing_dependency')
  }

  const rank = new Map(stableIds.map((id, index) => [id, index]))
  const incoming = new Map<string, number>()
  const children = new Map<string, string[]>()
  const layer = new Map<string, number>()
  for (const task of stableTasks) {
    const dependencies = parseDependencyIds(task.dependencyIds)
    incoming.set(task.id, dependencies.length)
    layer.set(task.id, 0)
    for (const dependencyId of dependencies) {
      const dependentTasks = children.get(dependencyId) ?? []
      dependentTasks.push(task.id)
      children.set(dependencyId, dependentTasks)
    }
  }

  const ready = stableIds.filter((id) => incoming.get(id) === 0)
  const orderedTaskIds: string[] = []
  while (ready.length > 0) {
    ready.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    const taskId = ready.shift()!
    orderedTaskIds.push(taskId)
    for (const childId of children.get(taskId) ?? []) {
      layer.set(childId, Math.max(layer.get(childId) ?? 0, (layer.get(taskId) ?? 0) + 1))
      const remaining = (incoming.get(childId) ?? 0) - 1
      incoming.set(childId, remaining)
      if (remaining === 0) {
        ready.push(childId)
      }
    }
  }
  if (orderedTaskIds.length !== stableTasks.length) {
    return outlineLayout(stableIds, 'cycle')
  }

  return graphLayout(orderedTaskIds, taskById, layer)
}

export function parseDependencyIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ]
}

function graphLayout(
  orderedTaskIds: string[],
  taskById: Map<string, OrchestrationRunConsoleTask>,
  layers: Map<string, number>
): RunConsoleTaskLayout {
  const rowsByLayer = new Map<number, string[]>()
  for (const taskId of orderedTaskIds) {
    const taskLayer = layers.get(taskId) ?? 0
    rowsByLayer.set(taskLayer, [...(rowsByLayer.get(taskLayer) ?? []), taskId])
  }
  const nodes = orderedTaskIds.map((taskId): RunConsoleTaskLayoutNode => {
    const taskLayer = layers.get(taskId) ?? 0
    const row = rowsByLayer.get(taskLayer)?.indexOf(taskId) ?? 0
    return {
      taskId,
      layer: taskLayer,
      x: CANVAS_PADDING + taskLayer * (NODE_WIDTH + LAYER_GAP),
      y: CANVAS_PADDING + row * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.taskId, node]))
  const edges: RunConsoleTaskLayoutEdge[] = []
  for (const taskId of orderedTaskIds) {
    for (const dependencyId of parseDependencyIds(taskById.get(taskId)?.dependencyIds)) {
      const from = nodeById.get(dependencyId)!
      const to = nodeById.get(taskId)!
      const startX = from.x + from.width
      const startY = from.y + from.height / 2
      const endX = to.x
      const endY = to.y + to.height / 2
      const middleX = startX + (endX - startX) / 2
      edges.push({
        id: `${dependencyId}->${taskId}`,
        fromTaskId: dependencyId,
        toTaskId: taskId,
        path: `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`
      })
    }
  }
  const maxLayer = Math.max(0, ...nodes.map((node) => node.layer))
  const maxRows = Math.max(1, ...rowsByLayer.values().map((rows) => rows.length))
  return {
    mode: 'graph',
    fallback: null,
    orderedTaskIds,
    nodes,
    edges,
    width: CANVAS_PADDING * 2 + (maxLayer + 1) * NODE_WIDTH + maxLayer * LAYER_GAP,
    height: CANVAS_PADDING * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP
  }
}

function outlineLayout(
  orderedTaskIds: string[],
  fallback: RunConsoleTaskLayoutFallback
): RunConsoleTaskLayout {
  return { mode: 'outline', fallback, orderedTaskIds, nodes: [], edges: [], width: 0, height: 0 }
}

function compareTasks(a: OrchestrationRunConsoleTask, b: OrchestrationRunConsoleTask): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}
