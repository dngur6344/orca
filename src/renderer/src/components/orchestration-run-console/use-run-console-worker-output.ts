import { useEffect, useState } from 'react'
import type { OrchestrationWorkerReadResult } from '../../../../shared/orchestration-worker-output'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { readRunConsoleWorkerOutput } from './run-console-worker-output'

export type RunConsoleWorkerOutputState = {
  loading: boolean
  result: OrchestrationWorkerReadResult | null
  error: string | null
}

const IDLE_STATE: RunConsoleWorkerOutputState = { loading: false, result: null, error: null }

export function useRunConsoleWorkerOutput(args: {
  target: RuntimeClientTarget
  dispatchId: string | null
  enabled: boolean
}): RunConsoleWorkerOutputState {
  const [state, setState] = useState<RunConsoleWorkerOutputState>(IDLE_STATE)

  useEffect(() => {
    if (!args.enabled || !args.dispatchId) {
      setState(IDLE_STATE)
      return
    }
    const controller = new AbortController()
    setState({ loading: true, result: null, error: null })
    void readRunConsoleWorkerOutput(args.target, args.dispatchId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setState({ loading: false, result, error: null })
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            loading: false,
            result: null,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    return () => controller.abort()
  }, [args.dispatchId, args.enabled, args.target])

  return state
}
