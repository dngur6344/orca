import { z } from 'zod'
import { ORCHESTRATION_RUN_PAGE_LIMIT } from '../../../../shared/orchestration-run-pagination'
import {
  getOrchestrationRunConsoleSnapshot,
  listOrchestrationRunConsoleRuns
} from '../../orchestration/run-console-projection'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'

const ConsoleListParams = z.object({
  limit: z.number().int().min(1).max(ORCHESTRATION_RUN_PAGE_LIMIT).optional(),
  cursor: z.string().min(1).optional()
})

const ConsoleSnapshotParams = z.object({ run: requiredString('Missing --run') })

export const ORCHESTRATION_RUN_CONSOLE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.consoleList',
    params: ConsoleListParams,
    handler: (params, { runtime }) =>
      listOrchestrationRunConsoleRuns(runtime.getOrchestrationDb(), params)
  }),
  defineMethod({
    name: 'orchestration.consoleSnapshot',
    params: ConsoleSnapshotParams,
    handler: (params, { runtime }) => {
      const snapshot = getOrchestrationRunConsoleSnapshot(runtime.getOrchestrationDb(), params.run)
      if (!snapshot) {
        throw new OrchestrationError('run_not_found', `Run ${params.run} was not found.`)
      }
      return snapshot
    }
  })
]
