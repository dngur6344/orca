import { describe, expect, it } from 'vitest'
import type { OrchestrationRunConsoleTask } from '../../../../shared/orchestration-run-console'
import {
  layoutRunConsoleTasks,
  parseDependencyIds,
  RUN_CONSOLE_GRAPH_TASK_LIMIT
} from './run-console-task-layout'

function task(
  id: string,
  dependencyIds: string[] = [],
  createdAt = `2026-08-07T00:00:${id.padStart(2, '0')}Z`
): OrchestrationRunConsoleTask {
  return {
    id,
    runId: 'run-1',
    parentId: null,
    title: id,
    displayName: null,
    spec: `Do ${id}`,
    status: 'pending',
    dependencyIds,
    dependenciesValid: true,
    result: null,
    createdAt,
    completedAt: null
  }
}

describe('layoutRunConsoleTasks', () => {
  it('lays out a diamond in stable topological layers', () => {
    const result = layoutRunConsoleTasks([
      task('d', ['b', 'c']),
      task('c', ['a']),
      task('a'),
      task('b', ['a'])
    ])

    expect(result.mode).toBe('graph')
    expect(result.orderedTaskIds).toEqual(['a', 'b', 'c', 'd'])
    expect(result.nodes.map((node) => [node.taskId, node.layer])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 1],
      ['d', 2]
    ])
    expect(result.edges.map((edge) => edge.id)).toEqual(['a->b', 'a->c', 'b->d', 'c->d'])
  })

  it('keeps disconnected roots and repeated layouts stable', () => {
    const tasks = [
      task('second', [], '2026-08-07T00:00:02Z'),
      task('first', [], '2026-08-07T00:00:01Z')
    ]
    expect(layoutRunConsoleTasks(tasks)).toEqual(layoutRunConsoleTasks(tasks.toReversed()))
    expect(layoutRunConsoleTasks(tasks).orderedTaskIds).toEqual(['first', 'second'])
  })

  it.each([
    ['cycle', [task('a', ['b']), task('b', ['a'])]],
    ['missing_dependency', [task('a', ['missing'])]],
    ['duplicate_task', [task('a'), task('a')]]
  ] as const)('falls back for %s data', (fallback, tasks) => {
    expect(layoutRunConsoleTasks(tasks)).toMatchObject({ mode: 'outline', fallback })
  })

  it('falls back at the tested conservative size boundary', () => {
    const tasks = Array.from({ length: RUN_CONSOLE_GRAPH_TASK_LIMIT + 1 }, (_, index) =>
      task(`task-${index}`)
    )
    expect(layoutRunConsoleTasks(tasks)).toMatchObject({
      mode: 'outline',
      fallback: 'too_many_tasks'
    })
  })

  it('deduplicates and rejects malformed dependency values defensively', () => {
    expect(parseDependencyIds([' a ', 'a', '', 3, null])).toEqual(['a'])
    expect(parseDependencyIds('a')).toEqual([])
  })
})
