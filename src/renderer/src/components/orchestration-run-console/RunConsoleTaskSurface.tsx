import React, { useEffect, useMemo, useState } from 'react'
import { ListTree, Network, PanelRight } from 'lucide-react'
import type { OrchestrationRunConsoleSnapshot } from '../../../../shared/orchestration-run-console'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { translate } from '@/i18n/i18n'
import { RunConsoleTaskGraph } from './RunConsoleTaskGraph'
import { RunConsoleTaskInspector } from './RunConsoleTaskInspector'
import { RunConsoleTaskOutline } from './RunConsoleTaskOutline'
import { layoutRunConsoleTasks, type RunConsoleTaskLayoutFallback } from './run-console-task-layout'
import type { RunConsoleOperatorCall } from './run-console-operator-types'

type RunConsoleTaskSurfaceProps = {
  snapshot: OrchestrationRunConsoleSnapshot | null
  selectedTaskId: string | null
  viewMode: 'graph' | 'outline'
  target: RuntimeClientTarget
  targetLabel: string
  callOperator?: RunConsoleOperatorCall
  actionsDisabled?: boolean
  onSelectTask: (taskId: string) => void
  onViewModeChange: (mode: 'graph' | 'outline') => void
}

export function RunConsoleTaskSurface(props: RunConsoleTaskSurfaceProps): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const layout = useMemo(
    () => layoutRunConsoleTasks(props.snapshot?.tasks ?? []),
    [props.snapshot?.tasks]
  )
  const effectiveMode = layout.mode === 'outline' ? 'outline' : props.viewMode
  const selectedTask =
    props.snapshot?.tasks.find((task) => task.id === props.selectedTaskId) ?? null

  useEffect(() => setSheetOpen(false), [props.snapshot?.run.id])

  if (!props.snapshot) {
    return <EmptyTaskSurface />
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section
        className="flex min-h-0 min-w-0 flex-col"
        aria-labelledby="run-console-tasks-heading"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <h2 id="run-console-tasks-heading" className="text-xs font-semibold">
            {translate('auto.runConsole.tasks.title', 'Tasks')}
          </h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {props.snapshot.tasks.length}
          </span>
          <div
            className="ml-auto flex items-center rounded-md border border-border p-0.5"
            aria-label={translate('auto.runConsole.tasks.viewMode', 'Task view')}
          >
            <Button
              size="sm"
              variant={effectiveMode === 'graph' ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              aria-pressed={effectiveMode === 'graph'}
              disabled={layout.mode === 'outline'}
              onClick={() => props.onViewModeChange('graph')}
            >
              <Network className="size-3.5" />
              {translate('auto.runConsole.tasks.graph', 'Graph')}
            </Button>
            <Button
              size="sm"
              variant={effectiveMode === 'outline' ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              aria-pressed={effectiveMode === 'outline'}
              onClick={() => props.onViewModeChange('outline')}
            >
              <ListTree className="size-3.5" />
              {translate('auto.runConsole.tasks.outline', 'Outline')}
            </Button>
          </div>
          {selectedTask ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs lg:hidden"
              onClick={() => setSheetOpen(true)}
            >
              <PanelRight className="size-3.5" />
              {translate('auto.runConsole.tasks.inspect', 'Inspect')}
            </Button>
          ) : null}
        </div>
        {layout.fallback ? <LayoutFallback reason={layout.fallback} /> : null}
        {props.snapshot.tasks.length === 0 ? (
          <p className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
            {translate('auto.runConsole.tasks.empty', 'This run has no tasks.')}
          </p>
        ) : effectiveMode === 'graph' ? (
          <RunConsoleTaskGraph
            snapshot={props.snapshot}
            layout={layout}
            selectedTaskId={props.selectedTaskId}
            reducedMotion={reducedMotion}
            onSelectTask={props.onSelectTask}
          />
        ) : (
          <RunConsoleTaskOutline
            snapshot={props.snapshot}
            orderedTaskIds={layout.orderedTaskIds}
            selectedTaskId={props.selectedTaskId}
            reducedMotion={reducedMotion}
            onSelectTask={props.onSelectTask}
          />
        )}
      </section>
      {selectedTask ? (
        <RunConsoleTaskInspector
          snapshot={props.snapshot}
          task={selectedTask}
          target={props.target}
          targetLabel={props.targetLabel}
          callOperator={props.callOperator}
          actionsDisabled={props.actionsDisabled}
          className="hidden min-h-0 border-l border-border lg:flex lg:flex-col"
        />
      ) : (
        <p className="hidden items-center justify-center border-l border-border p-6 text-center text-xs text-muted-foreground lg:flex">
          {translate('auto.runConsole.tasks.selectTask', 'Select a task to inspect details.')}
        </p>
      )}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-[min(92vw,560px)] p-0 motion-reduce:!animate-none motion-reduce:!transition-none"
          overlayClassName="motion-reduce:!animate-none motion-reduce:!transition-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {selectedTask?.title ??
                translate('auto.runConsole.inspector.label', 'Task inspector')}
            </SheetTitle>
            <SheetDescription>
              {translate(
                'auto.runConsole.inspector.description',
                'Task details and worker evidence'
              )}
            </SheetDescription>
          </SheetHeader>
          {selectedTask ? (
            <RunConsoleTaskInspector
              snapshot={props.snapshot}
              task={selectedTask}
              target={props.target}
              targetLabel={props.targetLabel}
              callOperator={props.callOperator}
              actionsDisabled={props.actionsDisabled}
              className="flex min-h-0 flex-1 flex-col"
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function LayoutFallback({ reason }: { reason: RunConsoleTaskLayoutFallback }): React.JSX.Element {
  const copy: Record<RunConsoleTaskLayoutFallback, string> = {
    too_many_tasks: translate(
      'auto.runConsole.tasks.fallbackLarge',
      'This run is too large for the graph. Showing the outline.'
    ),
    duplicate_task: translate(
      'auto.runConsole.tasks.fallbackDuplicate',
      'Duplicate task IDs prevent a safe graph. Showing the outline.'
    ),
    missing_dependency: translate(
      'auto.runConsole.tasks.fallbackMissing',
      'Dependency data is incomplete. Showing the outline.'
    ),
    cycle: translate(
      'auto.runConsole.tasks.fallbackCycle',
      'A dependency cycle was detected. Showing the outline.'
    )
  }
  return (
    <p
      role="status"
      className="border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      {copy[reason]}
    </p>
  )
}

function EmptyTaskSurface(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <h2 className="text-sm font-semibold">
          {translate('auto.runConsole.selectRun.title', 'Select a run')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {translate(
            'auto.runConsole.selectRun.description',
            'Choose a run to inspect its tasks and attention.'
          )}
        </p>
      </div>
    </div>
  )
}
