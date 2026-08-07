export const ORCHESTRATION_RUN_CONSOLE_TASK_LIMIT = 500
export const ORCHESTRATION_RUN_CONSOLE_DISPATCH_LIMIT = 750
export const ORCHESTRATION_RUN_CONSOLE_QUESTION_LIMIT = 200
export const ORCHESTRATION_RUN_CONSOLE_GATE_LIMIT = 200
export const ORCHESTRATION_RUN_CONSOLE_MESSAGE_LIMIT = 100
export const ORCHESTRATION_RUN_CONSOLE_WORKER_LIMIT = 500
export const ORCHESTRATION_RUN_CONSOLE_OPERATOR_ACTION_LIMIT = 100

export type OrchestrationRunConsoleRunState = 'needs_attention' | 'active' | 'completed' | 'unknown'

export type OrchestrationRunConsoleTaskStatus =
  | 'pending'
  | 'ready'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'blocked'

export type OrchestrationRunConsoleDispatchStatus =
  | 'pending'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'circuit_broken'

export type OrchestrationRunConsoleCounts = {
  tasks: number
  terminalTasks: number
  activeTasks: number
  pendingQuestions: number
  pendingGates: number
  failedTasks: number
  circuitBrokenDispatches: number
  resourceDecisions: number
}

export type OrchestrationRunConsoleRunSummary = {
  id: string
  objective: string
  legacyReadOnly: boolean
  state: OrchestrationRunConsoleRunState
  counts: OrchestrationRunConsoleCounts
  createdAt: string
  updatedAt: string
}

export type OrchestrationRunConsoleListResult = {
  runs: OrchestrationRunConsoleRunSummary[]
  nextCursor: string | null
}

export type OrchestrationRunConsoleTask = {
  id: string
  runId: string
  parentId: string | null
  title: string
  displayName: string | null
  spec: string
  status: OrchestrationRunConsoleTaskStatus
  dependencyIds: string[]
  dependenciesValid: boolean
  result: string | null
  createdAt: string
  completedAt: string | null
}

export type OrchestrationRunConsoleDispatch = {
  id: string
  runId: string
  taskId: string
  contractVersion: number
  assigneeHandle: string | null
  status: OrchestrationRunConsoleDispatchStatus
  failureCount: number
  lastFailure: string | null
  dispatchedAt: string | null
  completedAt: string | null
  createdAt: string
  lastHeartbeatAt: string | null
}

export type OrchestrationRunConsoleQuestion = {
  messageId: string
  runId: string
  taskId: string | null
  dispatchId: string
  prompt: string
  options: string[]
  status: 'pending' | 'answered' | 'closed'
  createdAt: string
  answeredAt: string | null
}

export type OrchestrationRunConsoleGate = {
  id: string
  runId: string
  taskId: string
  question: string
  options: string[]
  status: 'pending' | 'resolved' | 'timeout'
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

export type OrchestrationRunConsoleMessageReference = {
  id: string
  runId: string
  fromHandle: string
  toHandle: string
  subject: string
  type: string
  priority: string
  threadId: string | null
  createdAt: string
}

export type OrchestrationRunConsoleWorker = {
  dispatchId: string
  taskId: string
  runId: string
  workerState: string
  dispatchStatus: OrchestrationRunConsoleDispatchStatus
  agentTerminalHandle: string | null
  terminalState: string | null
  resource: null | {
    id: string
    worktreeId: string | null
    terminalHandle: string
    ownershipState: string
    releaseState: string
    retainedReason: string | null
  }
  federation: null | {
    environmentId: string
    environmentName: string
    remoteWorktreeId: string | null
    remoteTerminalHandle: string | null
  }
  createdAt: string
}

export type OrchestrationRunConsoleOperatorAction = {
  id: string
  requestId: string
  action: string
  state: string
  runId: string
  taskId: string | null
  dispatchId: string | null
  actorFingerprint: string
  errorCode: string | null
  replayCount: number
  createdAt: string
  updatedAt: string
}

export type OrchestrationRunConsoleAttentionItem = {
  id: string
  kind: 'question' | 'gate' | 'failure' | 'resource'
  runId: string
  taskId: string | null
  dispatchId: string | null
  createdAt: string
}

export type OrchestrationRunConsoleSnapshot = {
  run: OrchestrationRunConsoleRunSummary
  tasks: OrchestrationRunConsoleTask[]
  dispatches: OrchestrationRunConsoleDispatch[]
  questions: OrchestrationRunConsoleQuestion[]
  gates: OrchestrationRunConsoleGate[]
  messages: OrchestrationRunConsoleMessageReference[]
  workers: OrchestrationRunConsoleWorker[]
  operatorActions: OrchestrationRunConsoleOperatorAction[]
  attention: OrchestrationRunConsoleAttentionItem[]
  truncated: {
    tasks: boolean
    dispatches: boolean
    questions: boolean
    gates: boolean
    messages: boolean
    workers: boolean
    operatorActions: boolean
  }
}
