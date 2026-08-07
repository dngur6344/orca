import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

export function getRunConsoleTargetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}

export function parseRunConsoleTargetKey(key: string | null): RuntimeClientTarget | null {
  if (key === 'local') {
    return { kind: 'local' }
  }
  const prefix = 'environment:'
  if (!key?.startsWith(prefix)) {
    return null
  }
  const environmentId = key.slice(prefix.length).trim()
  return environmentId ? { kind: 'environment', environmentId } : null
}
