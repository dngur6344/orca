import { RuntimeClient } from '../../src/cli/runtime-client'
import { test as base, expect } from './helpers/orca-app'
import {
  isRunConsoleProcessAlive,
  resetRunConsoleProcessLedger,
  runConsoleCodexCommand,
  runConsoleProcessLaunchEnv
} from './helpers/orchestration-run-console-process-fixture'
import {
  callDesktopOperator,
  readRunConsoleSnapshot,
  startLiveRunConsoleWorker
} from './helpers/orchestration-run-console-live-runtime'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePaneHookDescriptor, waitForActivePanePtyId } from './helpers/terminal'

const OBJECTIVE = 'Live Run Console process verification'
const QUESTION = 'Should the live worker continue?'
const ANSWER = 'Continue through the UI'
const GATE_QUESTION = 'Approve the live release path?'
const FOLLOWUP = 'Inspect the exact live dispatch.'

const test = base.extend({
  launchEnv: [runConsoleProcessLaunchEnv(), { option: true }]
})

test.setTimeout(180_000)
test.beforeEach(resetRunConsoleProcessLedger)

test('supervises actual worker processes through the Run Console', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActivePanePtyId(orcaPage)
  const coordinatorPane = await waitForActivePaneHookDescriptor(orcaPage)
  await orcaPage.evaluate(async (command) => {
    const settings = await window.api.settings.set({ agentCmdOverrides: { codex: command } })
    window.__store?.setState({ settings })
  }, runConsoleCodexCommand)
  const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const client = new RuntimeClient(userDataDir, 40_000, null, null)
  const coordinator = await client.call<{ terminal: { handle: string } }>('terminal.resolvePane', {
    paneKey: coordinatorPane.paneKey
  })
  const coordinatorHandle = coordinator.result.terminal.handle
  const coordinatorTerminal = await client.call<{ terminal: { worktreeId: string } }>(
    'terminal.show',
    { terminal: coordinatorHandle }
  )
  await expect
    .poll(async () => {
      const listed = await client.call<{ worktrees: { id: string }[] }>('worktree.list', {})
      return listed.result.worktrees.some(
        (worktree) => worktree.id === coordinatorTerminal.result.terminal.worktreeId
      )
    })
    .toBe(true)
  const run = await client.call<{ run: { id: string } }>('orchestration.runCreate', {
    objective: OBJECTIVE,
    from: coordinatorHandle
  })
  const runId = run.result.run.id

  const retained = await startLiveRunConsoleWorker(
    client,
    runId,
    coordinatorHandle,
    'Retained worker',
    1
  )
  const stopped = await startLiveRunConsoleWorker(
    client,
    runId,
    coordinatorHandle,
    'Stopped worker',
    2
  )
  const abandoned = await startLiveRunConsoleWorker(
    client,
    runId,
    coordinatorHandle,
    'Abandoned worker',
    3
  )
  const released = await startLiveRunConsoleWorker(
    client,
    runId,
    coordinatorHandle,
    'Released worker',
    4
  )

  const gateTask = await client.call<{ task: { id: string } }>('orchestration.taskCreate', {
    spec: 'Wait for the live operator gate',
    taskTitle: 'Release gate',
    run: runId,
    callerTerminalHandle: coordinatorHandle
  })
  await client.call<{ gate: { id: string } }>('orchestration.gateCreate', {
    task: gateTask.result.task.id,
    question: GATE_QUESTION,
    options: JSON.stringify(['Approve', 'Hold']),
    from: coordinatorHandle,
    run: runId
  })
  const pendingAsk = client.call<{
    answer: string
    messageId: string
    timedOut: boolean
  }>(
    'orchestration.ask',
    {
      from: retained.handle,
      run: runId,
      question: QUESTION,
      options: 'Continue,Pause',
      timeoutMs: 30_000
    },
    { orchestrationCapability: retained.capability }
  )
  await expect
    .poll(async () => (await readRunConsoleSnapshot(client, runId)).questions.length)
    .toBe(1)

  await orcaPage.evaluate(() => {
    localStorage.setItem('orca.orchestration.enabled', '1')
    window.dispatchEvent(new CustomEvent('orca:orchestration-setup-state'))
  })
  const runsButton = orcaPage.getByRole('button', { name: /^(Runs|실행)$/ }).first()
  await expect(runsButton).toBeVisible()
  await runsButton.click()
  const runConsole = orcaPage.getByRole('region', { name: /^(Runs|실행)$/ })
  await expect(runConsole).toBeVisible()
  await expect(runConsole).toContainText(OBJECTIVE)
  await expect(runConsole).toContainText(QUESTION)
  await expect(runConsole).toContainText(GATE_QUESTION)

  const screenshotPath = testInfo.outputPath('run-console-live-process.png')
  await orcaPage.screenshot({ path: screenshotPath })
  await testInfo.attach('run-console-live-process', {
    path: screenshotPath,
    contentType: 'image/png'
  })

  await runConsole.getByRole('button').filter({ hasText: QUESTION }).click()
  await runConsole.getByRole('textbox', { name: /^(Answer|답변)$/ }).fill(ANSWER)
  await runConsole.getByRole('button', { name: /^(Send answer|답변 보내기)$/ }).click()
  const askResult = await pendingAsk
  expect(askResult.result).toMatchObject({ answer: ANSWER, timedOut: false })

  await runConsole.getByRole('button').filter({ hasText: GATE_QUESTION }).click()
  await runConsole.getByRole('button', { name: 'Approve', exact: true }).click()
  await runConsole.getByRole('button', { name: /^(Resolve gate|게이트 결정)$/ }).click()
  await expect
    .poll(async () => (await readRunConsoleSnapshot(client, runId)).gates[0]?.status)
    .toBe('resolved')

  const followup = await callDesktopOperator<{
    message: { body: string; to_handle: string }
  }>(
    orcaPage,
    'orchestration.consoleSendFollowup',
    { run: runId, dispatch: retained.dispatchId, body: FOLLOWUP },
    'live-followup'
  )
  expect(followup.message).toMatchObject({
    body: FOLLOWUP,
    to_handle: `dispatch:${retained.dispatchId}`
  })
  const workerInbox = await client.call<{ messages: { body: string }[] }>('orchestration.check', {
    terminal: retained.handle,
    all: true
  })
  expect(workerInbox.result.messages).toEqual(
    expect.arrayContaining([expect.objectContaining({ body: FOLLOWUP })])
  )

  const retainedResult = await callDesktopOperator<{ state: string }>(
    orcaPage,
    'orchestration.consoleRetainWorker',
    { run: runId, dispatch: retained.dispatchId },
    'live-retain'
  )
  expect(retainedResult.state).toBe('retained')
  expect(isRunConsoleProcessAlive(retained.pid)).toBe(true)

  const stoppedResult = await callDesktopOperator<{ state: string; processAction: string }>(
    orcaPage,
    'orchestration.consoleStopWorker',
    { run: runId, dispatch: stopped.dispatchId },
    'live-stop'
  )
  expect(stoppedResult).toMatchObject({
    state: 'stopped',
    processAction: 'closed_agent_terminal'
  })
  await expect.poll(() => isRunConsoleProcessAlive(stopped.pid)).toBe(false)

  const abandonedResult = await callDesktopOperator<{ state: string; processAction: string }>(
    orcaPage,
    'orchestration.consoleAbandonWorker',
    { run: runId, dispatch: abandoned.dispatchId },
    'live-abandon'
  )
  expect(abandonedResult).toMatchObject({ state: 'abandoned', processAction: 'none' })
  expect(isRunConsoleProcessAlive(abandoned.pid)).toBe(true)

  const completed = await client.call<{ message: { type: string } }>(
    'orchestration.send',
    {
      from: released.handle,
      subject: 'Live worker complete',
      body: 'Ready for release.',
      type: 'worker_done',
      payload: JSON.stringify({
        taskId: released.taskId,
        dispatchId: released.dispatchId,
        outcome: 'succeeded'
      })
    },
    { orchestrationCapability: released.capability }
  )
  expect(completed.result.message.type).toBe('worker_done')
  await expect
    .poll(
      async () =>
        (await readRunConsoleSnapshot(client, runId)).workers.find(
          (worker) => worker.dispatchId === released.dispatchId
        )?.workerState
    )
    .toBe('succeeded')
  expect(isRunConsoleProcessAlive(released.pid)).toBe(true)
  const releasedResult = await callDesktopOperator<{ state: string; processAction: string }>(
    orcaPage,
    'orchestration.consoleReleaseWorker',
    { run: runId, dispatch: released.dispatchId },
    'live-release'
  )
  expect(releasedResult).toMatchObject({
    state: 'released',
    processAction: 'closed_agent_terminal'
  })
  await expect.poll(() => isRunConsoleProcessAlive(released.pid)).toBe(false)

  const snapshot = await readRunConsoleSnapshot(client, runId)
  expect(snapshot.operatorActions.map((action) => action.action).sort()).toEqual(
    [
      'abandon_worker',
      'release_worker',
      'reply',
      'resolve_gate',
      'retain_worker',
      'send_followup',
      'stop_worker'
    ].sort()
  )
  expect(snapshot.operatorActions.every((action) => action.state === 'completed')).toBe(true)
  expect(JSON.stringify(snapshot)).not.toContain(ANSWER)
  expect(JSON.stringify(snapshot)).not.toContain(FOLLOWUP)
})
