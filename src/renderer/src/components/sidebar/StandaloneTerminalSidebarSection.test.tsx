// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { TerminalTab } from '../../../../shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  setTabCustomTitle: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (label, [key, value]) => label.replace(`{{${key}}}`, String(value)),
      fallback
    )
}))

import { StandaloneTerminalSidebarSection } from './StandaloneTerminalSidebarSection'

function terminal(id: string, customTitle: string | null = null): TerminalTab {
  return {
    id,
    ptyId: null,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    title: 'zsh',
    defaultTitle: 'Terminal 1',
    customTitle,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function renderSection(
  props: {
    onActivateTerminal?: (tabId: string) => void
    onCreateTerminal?: () => void
  } = {}
): HTMLElement {
  const view = render(
    <TooltipProvider>
      <StandaloneTerminalSidebarSection
        onActivateTerminal={props.onActivateTerminal ?? vi.fn()}
        onCreateTerminal={props.onCreateTerminal ?? vi.fn()}
      />
    </TooltipProvider>
  )
  return view.container
}

beforeEach(() => {
  mocks.setTabCustomTitle.mockReset()
  mocks.state = {
    activeTabIdByWorktree: {},
    activeWorktreeId: null,
    setTabCustomTitle: mocks.setTabCustomTitle,
    tabsByWorktree: {}
  }
})

afterEach(cleanup)

describe('StandaloneTerminalSidebarSection', () => {
  it('creates a terminal from the section add button', () => {
    const onCreateTerminal = vi.fn()
    renderSection({ onCreateTerminal })

    fireEvent.click(screen.getAllByRole('button', { name: 'New terminal' })[0])

    expect(onCreateTerminal).toHaveBeenCalledOnce()
  })

  it('activates and marks the selected standalone terminal', () => {
    const onActivateTerminal = vi.fn()
    mocks.state = {
      ...mocks.state,
      activeTabIdByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: 'terminal-1' },
      activeWorktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      tabsByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: [terminal('terminal-1')] }
    }
    renderSection({ onActivateTerminal })

    const row = screen.getByRole('button', { name: 'Terminal 1' })
    expect(row.getAttribute('aria-current')).toBe('page')
    fireEvent.click(row)

    expect(onActivateTerminal).toHaveBeenCalledWith('terminal-1')
  })

  it('sets a custom terminal name from the inline editor', () => {
    mocks.state = {
      ...mocks.state,
      tabsByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: [terminal('terminal-1')] }
    }
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Terminal 1' }))
    const input = screen.getByRole('textbox', { name: 'Rename terminal' })
    fireEvent.change(input, { target: { value: 'Server logs' } })
    fireEvent.blur(input)

    expect(mocks.setTabCustomTitle).toHaveBeenCalledWith('terminal-1', 'Server logs')
  })
})
