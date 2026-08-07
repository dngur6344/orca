import { RuntimeClient } from '../../src/cli/runtime-client'
import { test as base, expect } from './helpers/orca-app'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient,
  type PairedElectronClient
} from './helpers/paired-electron-client'
import {
  readRunConsoleSnapshot,
  startLiveRunConsoleWorker
} from './helpers/orchestration-run-console-live-runtime'
import {
  isRunConsoleProcessAlive,
  resetRunConsoleProcessLedger,
  runConsoleCodexCommand,
  runConsoleProcessLaunchEnv
} from './helpers/orchestration-run-console-process-fixture'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePaneHookDescriptor, waitForActivePanePtyId } from './helpers/terminal'

const OBJECTIVE = 'Paired Run Console process verification'
const QUESTION = 'Can the paired operator stop this worker?'
const ANSWER = 'Yes, stop the exact worker.'

const test = base.extend({
  launchEnv: [runConsoleProcessLaunchEnv(), { option: true }]
})

test.setTimeout(180_000)
test.beforeEach(resetRunConsoleProcessLedger)

async function openPairedRunConsole(client: PairedElectronClient): Promise<void> {
  await client.page.evaluate(() => {
    localStorage.setItem('orca.orchestration.enabled', '1')
    window.dispatchEvent(new CustomEvent('orca:orchestration-setup-state'))
  })
  const runsButton = client.page.getByRole('button', { name: /^(Runs|실행)$/ }).first()
  await expect(runsButton).toBeVisible()
  await runsButton.click()
  const consoleRegion = client.page.getByRole('region', { name: /^(Runs|실행)$/ })
  await expect(consoleRegion).toContainText(OBJECTIVE)
  await expect(consoleRegion).toContainText(QUESTION)
}

test('answers and stops an actual host worker from a paired desktop Run Console', async ({
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
  const runtime = new RuntimeClient(userDataDir, 40_000, null, null)
  const coordinator = await runtime.call<{ terminal: { handle: string } }>('terminal.resolvePane', {
    paneKey: coordinatorPane.paneKey
  })
  const coordinatorHandle = coordinator.result.terminal.handle
  const coordinatorTerminal = await runtime.call<{ terminal: { worktreeId: string } }>(
    'terminal.show',
    { terminal: coordinatorHandle }
  )
  await expect
    .poll(async () => {
      const listed = await runtime.call<{ worktrees: { id: string }[] }>('worktree.list', {})
      return listed.result.worktrees.some(
        (worktree) => worktree.id === coordinatorTerminal.result.terminal.worktreeId
      )
    })
    .toBe(true)
  const run = await runtime.call<{ run: { id: string } }>('orchestration.runCreate', {
    objective: OBJECTIVE,
    from: coordinatorHandle
  })
  const runId = run.result.run.id
  const worker = await startLiveRunConsoleWorker(
    runtime,
    runId,
    coordinatorHandle,
    'Paired worker',
    1
  )
  const pendingAsk = runtime.call<{ answer: string; timedOut: boolean }>(
    'orchestration.ask',
    {
      from: worker.handle,
      run: runId,
      question: QUESTION,
      timeoutMs: 40_000
    },
    { orchestrationCapability: worker.capability }
  )
  await expect
    .poll(async () => (await readRunConsoleSnapshot(runtime, runId)).questions.length)
    .toBe(1)

  const offer = await createRuntimeDesktopPairingOffer(orcaPage)
  const client = await launchPairedElectronClient(offer, testInfo, 'Paired Run Console host')
  try {
    await openPairedRunConsole(client)
    const consoleRegion = client.page.getByRole('region', { name: /^(Runs|실행)$/ })
    await expect(consoleRegion).toContainText('Paired Run Console host')
    const screenshotPath = testInfo.outputPath('run-console-paired-process.png')
    await client.page.screenshot({ path: screenshotPath })
    await testInfo.attach('run-console-paired-process', {
      path: screenshotPath,
      contentType: 'image/png'
    })

    await consoleRegion.getByRole('button').filter({ hasText: QUESTION }).click()
    await consoleRegion.getByRole('textbox', { name: /^(Answer|답변)$/ }).fill(ANSWER)
    await consoleRegion.getByRole('button', { name: /^(Send answer|답변 보내기)$/ }).click()
    await expect(pendingAsk).resolves.toMatchObject({ result: { answer: ANSWER, timedOut: false } })

    const stopped = await client.page.evaluate(
      async ({ dispatchId, environmentId, runId }) => {
        const response = await window.api.runtimeEnvironments.call({
          selector: environmentId,
          method: 'orchestration.consoleStopWorker',
          params: { run: runId, dispatch: dispatchId },
          orchestrationRequestId: 'paired-live-stop'
        })
        if (!response.ok) {
          throw new Error(`${response.error.code}: ${response.error.message}`)
        }
        return response.result as { state: string; processAction: string }
      },
      { dispatchId: worker.dispatchId, environmentId: client.environmentId, runId }
    )
    expect(stopped).toMatchObject({
      state: 'stopped',
      processAction: 'closed_agent_terminal'
    })
    await expect.poll(() => isRunConsoleProcessAlive(worker.pid)).toBe(false)

    const snapshot = await readRunConsoleSnapshot(runtime, runId)
    expect(snapshot.operatorActions.map((action) => action.action).sort()).toEqual([
      'reply',
      'stop_worker'
    ])
    expect(snapshot.operatorActions.every((action) => action.state === 'completed')).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain(ANSWER)
    expect(await client.getDirectSshAttemptTargetIds()).toEqual([])
  } finally {
    await client.dispose()
  }
})
