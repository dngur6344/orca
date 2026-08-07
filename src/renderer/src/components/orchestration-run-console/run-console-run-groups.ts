import type {
  OrchestrationRunConsoleRunState,
  OrchestrationRunConsoleRunSummary
} from '../../../../shared/orchestration-run-console'

export type RunConsoleRunFilter = 'all' | Exclude<OrchestrationRunConsoleRunState, 'unknown'>
export type RunConsoleRunGroupId = 'needs_attention' | 'active' | 'completed'

export type RunConsoleRunGroup = {
  id: RunConsoleRunGroupId
  runs: OrchestrationRunConsoleRunSummary[]
}

export function groupRunConsoleRuns(
  runs: readonly OrchestrationRunConsoleRunSummary[],
  query: string,
  filter: RunConsoleRunFilter
): RunConsoleRunGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = runs.filter((run) => {
    const matchesQuery =
      !normalizedQuery ||
      run.objective.toLocaleLowerCase().includes(normalizedQuery) ||
      run.id.toLocaleLowerCase().includes(normalizedQuery)
    const matchesFilter =
      filter === 'all' || run.state === filter || (filter === 'active' && run.state === 'unknown')
    return matchesQuery && matchesFilter
  })
  return [
    {
      id: 'needs_attention',
      runs: visible.filter((run) => run.state === 'needs_attention')
    },
    {
      id: 'active',
      runs: visible.filter((run) => run.state === 'active' || run.state === 'unknown')
    },
    {
      id: 'completed',
      runs: visible.filter((run) => run.state === 'completed')
    }
  ]
}
