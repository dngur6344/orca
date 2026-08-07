import { describe, expect, it } from 'vitest'
import { getRunConsoleTargetKey, parseRunConsoleTargetKey } from './run-console-target'

describe('Run Console runtime targets', () => {
  it('round-trips local and connected runtime targets without a worktree identity', () => {
    const targets = [
      { kind: 'local' as const },
      { kind: 'environment' as const, environmentId: 'ssh-environment-1' }
    ]

    for (const target of targets) {
      expect(parseRunConsoleTargetKey(getRunConsoleTargetKey(target))).toEqual(target)
    }
  })

  it('rejects incomplete persisted environment targets', () => {
    expect(parseRunConsoleTargetKey(null)).toBeNull()
    expect(parseRunConsoleTargetKey('environment:')).toBeNull()
    expect(parseRunConsoleTargetKey('workspace:repo-1')).toBeNull()
  })
})
