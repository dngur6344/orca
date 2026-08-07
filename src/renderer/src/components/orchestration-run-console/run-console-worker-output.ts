import type { OrchestrationWorkerReadResult } from '../../../../shared/orchestration-worker-output'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

export async function readRunConsoleWorkerOutput(
  target: RuntimeClientTarget,
  dispatchId: string,
  signal: AbortSignal
): Promise<OrchestrationWorkerReadResult> {
  return await callRuntimeRpc(
    target,
    'orchestration.workerRead',
    { dispatch: dispatchId, source: 'auto', limit: 200 },
    { signal, timeoutMs: 15_000 }
  )
}

export function formatRunConsoleWorkerOutput(result: OrchestrationWorkerReadResult): string {
  if (result.source === 'terminal') {
    return result.terminal.tail.join('\n')
  }
  return result.transcript.messages
    .flatMap((message) =>
      message.blocks.map((block) => {
        if (block.type === 'text') {
          return block.text
        }
        if (block.type === 'tool-call') {
          return `[${message.role}] ${block.name}`
        }
        if (block.type === 'tool-result') {
          return block.output
        }
        return block.alt ?? block.path ?? block.url ?? '[image]'
      })
    )
    .filter(Boolean)
    .join('\n\n')
}
