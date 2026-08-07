export type RunConsoleOperatorCall = <TResult>(
  method: string,
  params: Record<string, unknown>,
  requestId: string
) => Promise<TResult>

export type RunConsoleOperatorReceipt = {
  operatorAction?: {
    requestId?: string
    state?: string
    replayCount?: number
  }
  mutation?: {
    requestId?: string
    replayed?: boolean
  }
}
