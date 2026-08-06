// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => ({
  state: {
    folderWorkspaces: [],
    groupBy: 'repo',
    openModal: vi.fn(),
    repos: [{ id: 'project-1' }]
  } as Record<string, unknown>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: () => '⌘N'
}))

vi.mock('./SidebarWorkspaceOptionsMenu', () => ({
  default: () => <div />
}))

vi.mock('../contextual-tours/workspace-creation-tour-handoff', () => ({
  openWorkspaceCreationComposerWithTourHandoff: vi.fn()
}))

import SidebarHeader from './SidebarHeader'

afterEach(cleanup)

describe('SidebarHeader', () => {
  it('collapses all projects from the control beside the section title', () => {
    const onCollapseAllProjects = vi.fn()
    const view = render(
      <TooltipProvider>
        <SidebarHeader
          onCollapseAllProjects={onCollapseAllProjects}
          onWorkspaceBoardMenuOpenChange={vi.fn()}
        />
      </TooltipProvider>
    )

    fireEvent.click(view.getByRole('button', { name: 'Collapse all projects' }))

    expect(onCollapseAllProjects).toHaveBeenCalledOnce()
  })
})
