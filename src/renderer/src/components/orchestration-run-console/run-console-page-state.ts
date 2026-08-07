import type { RunConsoleClientState } from './orchestration-run-console-client'

export type RunConsoleBlockingState = 'no_setup' | 'update_required' | 'unavailable' | null

export function getRunConsoleBlockingState(
  setupEnabled: boolean,
  state: Pick<RunConsoleClientState, 'capability' | 'catalog' | 'error'>
): RunConsoleBlockingState {
  if (!setupEnabled) {
    return 'no_setup'
  }
  if (state.capability === 'unsupported') {
    return 'update_required'
  }
  if (state.error && !state.catalog) {
    return 'unavailable'
  }
  return null
}
