import { describe, expect, it, vi } from 'vitest'
import { parseCodexDoctorChecks, probeAgentHealth } from './agent-health-probe'

describe('agent health probe', () => {
  it('keeps only connection-related Codex doctor checks', () => {
    const checks = parseCodexDoctorChecks(
      JSON.stringify({
        checks: [
          { id: 'auth.credentials', status: 'ok' },
          { id: 'network.provider_reachability', status: 'warning' },
          { id: 'network.websocket_reachability', status: 'fail' },
          { id: 'terminal.env', status: 'fail' },
          { id: 'mcp.config', status: 'warning' }
        ]
      })
    )

    expect(checks).toEqual([
      { id: 'authentication', status: 'ok' },
      { id: 'provider', status: 'warning' },
      { id: 'websocket', status: 'failed' }
    ])
  })

  it('probes both CLIs but only runs the non-interactive doctor for Codex', async () => {
    const runCommand = vi.fn(async (provider: 'claude' | 'codex', args: string[]) => {
      if (args[0] === '--version') {
        return {
          stdout: provider === 'claude' ? '1.0.61 (Claude Code)' : 'codex-cli 0.146.1',
          stderr: ''
        }
      }
      const error = Object.assign(new Error('doctor reported a failed check'), {
        stdout: JSON.stringify({
          checks: [
            { id: 'auth.credentials', status: 'ok' },
            { id: 'network.provider_reachability', status: 'ok' },
            { id: 'network.websocket_reachability', status: 'ok' },
            { id: 'terminal.env', status: 'fail' }
          ]
        })
      })
      throw error
    })

    const snapshots = await probeAgentHealth(undefined, { runCommand })

    expect(runCommand).toHaveBeenCalledTimes(3)
    expect(runCommand).not.toHaveBeenCalledWith('claude', ['doctor'], undefined)
    expect(snapshots).toMatchObject([
      {
        provider: 'claude',
        cliStatus: 'available',
        health: 'healthy',
        version: '1.0.61',
        checks: [{ id: 'cli', status: 'ok' }]
      },
      {
        provider: 'codex',
        cliStatus: 'available',
        health: 'healthy',
        version: '0.146.1',
        checks: [
          { id: 'cli', status: 'ok' },
          { id: 'authentication', status: 'ok' },
          { id: 'provider', status: 'ok' },
          { id: 'websocket', status: 'ok' }
        ]
      }
    ])
  })

  it('reports an unavailable CLI without attempting its deeper checks', async () => {
    const runCommand = vi.fn(async (provider: 'claude' | 'codex') => {
      if (provider === 'codex') {
        throw new Error('not found')
      }
      return { stdout: '1.0.61 (Claude Code)', stderr: '' }
    })

    const snapshots = await probeAgentHealth(undefined, { runCommand })
    const codex = snapshots.find((snapshot) => snapshot.provider === 'codex')

    expect(codex).toMatchObject({
      cliStatus: 'unavailable',
      health: 'unhealthy',
      version: null,
      checks: [{ id: 'cli', status: 'failed' }]
    })
    expect(runCommand).not.toHaveBeenCalledWith('codex', ['doctor', '--json'], undefined)
  })
})
