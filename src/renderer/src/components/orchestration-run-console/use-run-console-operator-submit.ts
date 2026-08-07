import { useCallback, useEffect, useRef, useState } from 'react'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'
import { createRunConsoleRequestId } from './orchestration-run-console-client'
import type {
  RunConsoleOperatorCall,
  RunConsoleOperatorReceipt
} from './run-console-operator-types'

const RUN_CONSOLE_ACTION_PROGRESS_DELAY_MS = 600
const UNKNOWN_OUTCOME_CODES = new Set([
  'operation_unknown',
  'timeout',
  'runtime_timeout',
  'runtime_unavailable',
  'remote_runtime_unavailable'
])

export type RunConsoleOperatorSubmitState = {
  phase: 'idle' | 'pending' | 'success' | 'error' | 'unknown'
  showProgress: boolean
  message: string | null
  replayed: boolean
}

type OperatorAttempt = {
  method: string
  params: Record<string, unknown>
  requestId: string
}

const IDLE_STATE: RunConsoleOperatorSubmitState = {
  phase: 'idle',
  showProgress: false,
  message: null,
  replayed: false
}

export function useRunConsoleOperatorSubmit(
  identityKey: string,
  callOperator: RunConsoleOperatorCall | undefined
): RunConsoleOperatorSubmitState & {
  submit: (method: string, params: Record<string, unknown>) => Promise<boolean>
  retry: () => Promise<boolean>
} {
  const [state, setState] = useState(IDLE_STATE)
  const attemptRef = useRef<OperatorAttempt | null>(null)
  const pendingRef = useRef(false)
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    pendingRef.current = false
    attemptRef.current = null
    clearProgressTimer()
    setState(IDLE_STATE)
  }, [clearProgressTimer, identityKey])

  useEffect(() => clearProgressTimer, [clearProgressTimer])

  const execute = useCallback(
    async (attempt: OperatorAttempt): Promise<boolean> => {
      if (!callOperator || pendingRef.current) {
        return false
      }
      pendingRef.current = true
      attemptRef.current = attempt
      setState({ phase: 'pending', showProgress: false, message: null, replayed: false })
      progressTimerRef.current = setTimeout(() => {
        setState((current) =>
          current.phase === 'pending' ? { ...current, showProgress: true } : current
        )
      }, RUN_CONSOLE_ACTION_PROGRESS_DELAY_MS)
      try {
        const result = await callOperator<RunConsoleOperatorReceipt>(
          attempt.method,
          attempt.params,
          attempt.requestId
        )
        const unknown = result.operatorAction?.state === 'outcome_unknown'
        const replayed =
          result.mutation?.replayed === true || (result.operatorAction?.replayCount ?? 0) > 0
        setState({
          phase: unknown ? 'unknown' : 'success',
          showProgress: false,
          message: unknown ? 'The runtime could not prove the final outcome.' : null,
          replayed
        })
        if (!unknown) {
          attemptRef.current = null
        }
        return !unknown
      } catch (error) {
        const unknown = isRunConsoleOperatorOutcomeUnknown(error)
        setState({
          phase: unknown ? 'unknown' : 'error',
          showProgress: false,
          message: error instanceof Error ? error.message : String(error),
          replayed: false
        })
        if (!unknown) {
          attemptRef.current = null
        }
        return false
      } finally {
        pendingRef.current = false
        clearProgressTimer()
      }
    },
    [callOperator, clearProgressTimer]
  )

  const submit = useCallback(
    (method: string, params: Record<string, unknown>) => {
      const existing = attemptRef.current
      const attempt = existing ?? { method, params, requestId: createRunConsoleRequestId() }
      return execute(attempt)
    },
    [execute]
  )
  const retry = useCallback(
    () => (attemptRef.current ? execute(attemptRef.current) : Promise.resolve(false)),
    [execute]
  )

  return { ...state, submit, retry }
}

export function isRunConsoleOperatorOutcomeUnknown(error: unknown): boolean {
  if (!(error instanceof RuntimeRpcCallError)) {
    return true
  }
  return UNKNOWN_OUTCOME_CODES.has(error.code)
}
