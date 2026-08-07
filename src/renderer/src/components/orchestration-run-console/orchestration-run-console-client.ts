import type {
  OrchestrationRunConsoleListResult,
  OrchestrationRunConsoleSnapshot
} from '../../../../shared/orchestration-run-console'
import { ORCHESTRATION_RUN_CONSOLE_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  DEFAULT_RUN_CONSOLE_CLIENT_DEPENDENCIES,
  type RunConsoleClientDependencies
} from './orchestration-run-console-rpc'

export type { RunConsoleClientDependencies } from './orchestration-run-console-rpc'

export const RUN_CONSOLE_POLL_INTERVAL_MS = 5_000
const RUN_CONSOLE_CATALOG_POLL_TICKS = 3
const RUN_CONSOLE_COMPLETED_POLL_TICKS = 4

export type RunConsoleCapability = 'checking' | 'supported' | 'unsupported'

export type RunConsoleClientState = {
  target: RuntimeClientTarget
  capability: RunConsoleCapability
  catalog: OrchestrationRunConsoleListResult | null
  snapshot: OrchestrationRunConsoleSnapshot | null
  selectedRunId: string | null
  loading: boolean
  loadingMore: boolean
  stale: boolean
  error: string | null
}

export class OrchestrationRunConsoleClient {
  private state: RunConsoleClientState
  private generation = 0
  private requestController: AbortController | null = null
  private stopPolling: (() => void) | null = null
  private pollTick = 0

  constructor(
    private readonly onState: (state: RunConsoleClientState) => void,
    private readonly dependencies: RunConsoleClientDependencies = DEFAULT_RUN_CONSOLE_CLIENT_DEPENDENCIES,
    target: RuntimeClientTarget = { kind: 'local' }
  ) {
    this.state = initialState(target)
  }

  getState(): RunConsoleClientState {
    return this.state
  }

  setTarget(target: RuntimeClientTarget, selectedRunId: string | null = null): void {
    if (targetKey(target) === targetKey(this.state.target)) {
      if (selectedRunId !== this.state.selectedRunId) {
        this.selectRun(selectedRunId)
      }
      return
    }
    this.cancelRequest()
    this.generation += 1
    this.state = { ...initialState(target), selectedRunId }
    this.emit()
    void this.refresh({ checkCapability: true, catalog: true, snapshot: true })
  }

  selectRun(runId: string | null): void {
    if (runId === this.state.selectedRunId) {
      return
    }
    this.cancelRequest()
    this.generation += 1
    this.state = { ...this.state, selectedRunId: runId, snapshot: null, stale: false, error: null }
    this.emit()
    void this.refresh({ catalog: false, snapshot: true })
  }

  start(): void {
    if (this.stopPolling) {
      return
    }
    this.stopPolling = this.dependencies.installInterval({
      run: () => this.poll(),
      runOnVisible: () => void this.refresh({ catalog: true, snapshot: true }),
      intervalMs: RUN_CONSOLE_POLL_INTERVAL_MS
    })
  }

  stop(): void {
    this.stopPolling?.()
    this.stopPolling = null
    this.cancelRequest()
    this.generation += 1
  }

  async refreshNow(): Promise<void> {
    await this.refresh({ catalog: true, snapshot: true })
  }

  async loadMoreRuns(): Promise<void> {
    const cursor = this.state.catalog?.nextCursor
    if (!cursor || this.state.capability !== 'supported' || this.state.loadingMore) {
      return
    }
    const generation = this.generation
    const controller = new AbortController()
    this.state = { ...this.state, loadingMore: true }
    this.emit()
    try {
      const page = await this.dependencies.listRuns(this.state.target, controller.signal, cursor)
      if (generation !== this.generation) {
        return
      }
      const knownIds = new Set(this.state.catalog?.runs.map((run) => run.id))
      this.state = {
        ...this.state,
        catalog: {
          runs: [
            ...(this.state.catalog?.runs ?? []),
            ...page.runs.filter((run) => !knownIds.has(run.id))
          ],
          nextCursor: page.nextCursor
        },
        loadingMore: false,
        error: null
      }
      this.emit()
    } catch (error) {
      if (generation !== this.generation) {
        return
      }
      this.state = {
        ...this.state,
        loadingMore: false,
        stale: true,
        error: error instanceof Error ? error.message : String(error)
      }
      this.emit()
    }
  }

  async callOperator<TResult>(
    method: string,
    params: Record<string, unknown>,
    requestId: string
  ): Promise<TResult> {
    if (this.state.capability !== 'supported') {
      throw new Error('Run Console actions require a runtime with orchestration.run-console.v1.')
    }
    const result = await this.dependencies.callOperator<TResult>(
      this.state.target,
      method,
      params,
      requestId
    )
    await this.refreshNow()
    return result
  }

  private poll(): void {
    this.pollTick += 1
    const completed = this.state.snapshot?.run.state === 'completed'
    void this.refresh({
      catalog: this.pollTick % RUN_CONSOLE_CATALOG_POLL_TICKS === 0,
      snapshot: !completed || this.pollTick % RUN_CONSOLE_COMPLETED_POLL_TICKS === 0
    })
  }

  private async refresh(options: {
    checkCapability?: boolean
    catalog: boolean
    snapshot: boolean
  }): Promise<void> {
    const generation = ++this.generation
    this.cancelRequest()
    const controller = new AbortController()
    this.requestController = controller
    this.state = { ...this.state, loading: this.state.catalog === null, error: null }
    this.emit()
    try {
      let capability = this.state.capability
      if (options.checkCapability || capability === 'checking') {
        const capabilities = await this.dependencies.getCapabilities(
          this.state.target,
          controller.signal
        )
        capability = capabilities.includes(ORCHESTRATION_RUN_CONSOLE_RUNTIME_CAPABILITY)
          ? 'supported'
          : 'unsupported'
      }
      if (generation !== this.generation || controller.signal.aborted) {
        return
      }
      if (capability === 'unsupported') {
        this.state = { ...this.state, capability, loading: false, stale: false, error: null }
        this.emit()
        return
      }
      const catalogPromise = options.catalog
        ? this.dependencies.listRuns(this.state.target, controller.signal)
        : Promise.resolve(this.state.catalog)
      const snapshotPromise =
        options.snapshot && this.state.selectedRunId
          ? this.dependencies.getSnapshot(
              this.state.target,
              this.state.selectedRunId,
              controller.signal
            )
          : Promise.resolve(this.state.snapshot)
      const [catalog, snapshot] = await Promise.all([catalogPromise, snapshotPromise])
      if (generation !== this.generation || controller.signal.aborted) {
        return
      }
      this.state = {
        ...this.state,
        capability,
        catalog,
        snapshot,
        loading: false,
        stale: false,
        error: null
      }
      this.emit()
    } catch (error) {
      if (generation !== this.generation || controller.signal.aborted) {
        return
      }
      this.state = {
        ...this.state,
        loading: false,
        stale: this.state.catalog !== null || this.state.snapshot !== null,
        error: error instanceof Error ? error.message : String(error)
      }
      this.emit()
    } finally {
      if (this.requestController === controller) {
        this.requestController = null
      }
    }
  }

  private cancelRequest(): void {
    this.requestController?.abort()
    this.requestController = null
  }

  private emit(): void {
    this.onState(this.state)
  }
}

export function createRunConsoleRequestId(): string {
  return crypto.randomUUID()
}

function targetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}

function initialState(target: RuntimeClientTarget): RunConsoleClientState {
  return {
    target,
    capability: 'checking',
    catalog: null,
    snapshot: null,
    selectedRunId: null,
    loading: true,
    loadingMore: false,
    stale: false,
    error: null
  }
}
