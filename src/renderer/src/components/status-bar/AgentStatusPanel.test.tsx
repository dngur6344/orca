import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentProviderReadiness } from './agent-readiness'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect: _onSelect,
    ...props
  }: React.PropsWithChildren<{ onSelect?: () => void }>) => <div {...props}>{children}</div>
}))
vi.mock('./tooltip', () => ({ formatTimeAgo: () => 'just now' }))

import { AgentStatusPanel } from './AgentStatusPanel'

const providers: AgentProviderReadiness[] = [
  {
    provider: 'claude',
    installed: true,
    linkedAccountCount: 2,
    state: 'degraded',
    reason: 'network',
    activeAccount: {
      id: 'active',
      label: 'active@claude.test',
      active: true,
      state: 'degraded',
      reason: 'network',
      checkedAt: 1
    },
    accounts: [
      {
        id: null,
        label: 'System default',
        active: false,
        state: 'unknown',
        reason: 'not-checked',
        checkedAt: null
      },
      {
        id: 'active',
        label: 'active@claude.test',
        active: true,
        state: 'degraded',
        reason: 'network',
        checkedAt: 1
      },
      {
        id: 'inactive',
        label: 'inactive@claude.test',
        active: false,
        state: 'ready',
        reason: 'ready',
        checkedAt: 2
      }
    ]
  }
]

function renderPanel(mode: 'verbose' | 'compact'): string {
  return renderToStaticMarkup(
    <AgentStatusPanel
      providers={providers}
      mode={mode}
      ownerLabel="This device"
      isRefreshing={false}
      loadError={false}
      onModeChange={() => {}}
      onRefresh={() => {}}
      onManageAccounts={() => {}}
    />
  )
}

describe('AgentStatusPanel', () => {
  it('shows every account and diagnostic copy in detailed mode', () => {
    const markup = renderPanel('verbose')

    expect(markup).toContain('Connection status')
    expect(markup).toContain('active@claude.test')
    expect(markup).toContain('inactive@claude.test')
    expect(markup).toContain('System default')
    expect(markup).toContain('Network check failed')
    expect(markup).toContain('Not checked')
  })

  it('keeps compact mode to the active account and provider summary', () => {
    const markup = renderPanel('compact')

    expect(markup).toContain('active@claude.test')
    expect(markup).not.toContain('inactive@claude.test')
    expect(markup).not.toContain('System default')
    expect(markup).not.toContain('Network check failed')
    expect(markup).toContain('Temporary issue')
  })
})
