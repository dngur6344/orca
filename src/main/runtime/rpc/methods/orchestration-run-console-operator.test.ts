import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { ORCHESTRATION_LEGACY_RUN_ID } from '../../../../shared/orchestration-rpc-contract'
import {
  ORCHESTRATION_CONTRACT_VERSION,
  ORCHESTRATION_RUN_CONSOLE_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES
} from '../../../../shared/protocol-version'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import type { RpcContext, RpcRequest } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { ORCHESTRATION_METHODS } from './orchestration'
import { ORCHESTRATION_RUN_CONSOLE_OPERATOR_METHODS } from './orchestration-run-console-operator'

describe('orchestration run console operator RPC', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => db?.close())

  function setup(): {
    db: OrchestrationDb
    runtime: OrcaRuntimeService
    dispatcher: RpcDispatcher
  } {
    db = new OrchestrationDb(':memory:')
    const runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    return {
      db,
      runtime,
      dispatcher: new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
    }
  }

  function request(
    method: string,
    params: Record<string, unknown>,
    requestId = `${method}-request`,
    authToken = 'desktop-user'
  ): RpcRequest {
    return {
      id: `rpc-${requestId}`,
      authToken,
      method,
      params,
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
      orchestrationRequestId: requestId
    }
  }

  it('answers without a live coordinator and replays one durably audited mutation', async () => {
    const { db: d, dispatcher } = setup()
    const run = d.createRun({
      objective: 'Answer',
      coordinatorHandle: 'gone_coordinator',
      coordinatorPaneKey: 'tab:11111111-1111-4111-8111-111111111111'
    })
    const task = d.createTask({ spec: 'Ask', runId: run.id })
    const dispatch = d.createDispatchContext(task.id, 'worker')
    const question = d.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: 'worker',
      question: 'Proceed?'
    })
    const rpcRequest = request(
      'orchestration.consoleReply',
      { run: run.id, question: question.question.message_id, body: 'Operator secret response' },
      'reply-1'
    )

    const first = await dispatcher.dispatch(rpcRequest)
    const replay = await dispatcher.dispatch({ ...rpcRequest, id: 'rpc-replay' })
    const mismatch = await dispatcher.dispatch({
      ...rpcRequest,
      id: 'rpc-mismatch',
      params: {
        run: run.id,
        question: question.question.message_id,
        body: 'Different answer'
      }
    })

    expect(first).toMatchObject({
      ok: true,
      result: {
        question: { status: 'answered', answer_body: 'Operator secret response' },
        mutation: { requestId: 'reply-1', replayed: false }
      }
    })
    expect(replay).toMatchObject({
      ok: true,
      result: { mutation: { requestId: 'reply-1', replayed: true } }
    })
    expect(mismatch).toMatchObject({ ok: false, error: { code: 'request_mismatch' } })
    const actor = createHash('sha256').update('desktop-user').digest('hex')
    expect(d.getOperatorAction(actor, 'reply-1')).toMatchObject({
      action: 'reply',
      state: 'completed',
      replay_count: 1,
      run_id: run.id,
      task_id: task.id,
      dispatch_id: dispatch.id
    })
    expect(d.getOperatorAction(actor, 'reply-1')).not.toHaveProperty('body')
    const snapshot = await dispatcher.dispatch({
      id: 'rpc-snapshot',
      authToken: 'desktop-user',
      method: 'orchestration.consoleSnapshot',
      params: { run: run.id }
    })
    expect(snapshot).toMatchObject({
      ok: true,
      result: {
        operatorActions: [
          {
            action: 'reply',
            state: 'completed',
            replayCount: 1,
            actorFingerprint: actor
          }
        ]
      }
    })
    expect(JSON.stringify(snapshot)).not.toContain('Operator secret response')
    expect(RUNTIME_CAPABILITIES).toContain(ORCHESTRATION_RUN_CONSOLE_RUNTIME_CAPABILITY)
  })

  it('resolves gates and sends exact-dispatch follow-up without coordinator authority', async () => {
    const { db: d, dispatcher } = setup()
    const run = d.createRun({
      objective: 'Supervise',
      coordinatorHandle: 'gone',
      coordinatorPaneKey: 'tab:22222222-2222-4222-8222-222222222222'
    })
    const gateTask = d.createTask({ spec: 'Gate', runId: run.id })
    const gate = d.createGate({ taskId: gateTask.id, question: 'Approve?' })
    const gateResponse = await dispatcher.dispatch(
      request(
        'orchestration.consoleResolveGate',
        { run: run.id, gate: gate.id, resolution: 'approved' },
        'gate-1'
      )
    )
    expect(gateResponse).toMatchObject({ ok: true, result: { gate: { status: 'resolved' } } })

    const task = d.createTask({ spec: 'Follow up', runId: run.id })
    const dispatch = d.createDispatchContext(task.id, 'worker')
    const followup = await dispatcher.dispatch(
      request(
        'orchestration.consoleSendFollowup',
        { run: run.id, dispatch: dispatch.id, body: 'Please add tests.' },
        'followup-1'
      )
    )
    expect(followup).toMatchObject({
      ok: true,
      result: { message: { to_handle: `dispatch:${dispatch.id}`, body: 'Please add tests.' } }
    })
    expect(d.getAllMessages(`dispatch:${dispatch.id}`)[0]).toMatchObject({
      from_handle: expect.stringMatching(/^operator:/),
      run_id: run.id
    })
  })

  it('audits wrong-run and legacy rejections without mutating the target dispatch', async () => {
    const { db: d, dispatcher } = setup()
    const runA = d.createRun({
      objective: 'A',
      coordinatorHandle: 'a',
      coordinatorPaneKey: 'tab:a'
    })
    const runB = d.createRun({
      objective: 'B',
      coordinatorHandle: 'b',
      coordinatorPaneKey: 'tab:b'
    })
    const task = d.createTask({ spec: 'Worker', runId: runA.id })
    const started = d.createStartingWorkerDispatch({ taskId: task.id, startOptions: {} })

    const wrongRun = await dispatcher.dispatch(
      request(
        'orchestration.consoleAbandonWorker',
        { run: runB.id, dispatch: started.dispatch.id },
        'wrong-run'
      )
    )
    expect(wrongRun).toMatchObject({ ok: false, error: { code: 'dispatch_not_found' } })
    expect(d.getWorkerDispatch(started.dispatch.id)?.state).toBe('starting')
    const actor = createHash('sha256').update('desktop-user').digest('hex')
    expect(d.getOperatorAction(actor, 'wrong-run')).toMatchObject({
      state: 'failed',
      error_code: 'dispatch_not_found',
      run_id: runB.id
    })

    const legacy = await dispatcher.dispatch(
      request(
        'orchestration.consoleRetainWorker',
        { run: ORCHESTRATION_LEGACY_RUN_ID, dispatch: 'legacy-dispatch' },
        'legacy-run'
      )
    )
    expect(legacy).toMatchObject({ ok: false, error: { code: 'legacy_read_only' } })
    expect(d.getOperatorAction(actor, 'legacy-run')).toMatchObject({
      state: 'failed',
      error_code: 'legacy_read_only'
    })
  })

  it('records unknown stop outcomes and fails closed for federated release', async () => {
    const { db: d, dispatcher } = setup()
    const run = d.createRun({
      objective: 'Workers',
      coordinatorHandle: 'coordinator',
      coordinatorPaneKey: 'tab:workers'
    })
    const localTask = d.createTask({ spec: 'Local worker', runId: run.id })
    const local = d.createStartingWorkerDispatch({ taskId: localTask.id, startOptions: {} })
    d.prepareStartingWorkerAuthority({
      dispatchId: local.dispatch.id,
      handle: 'missing-worker',
      paneKey: 'tab:missing-worker',
      processIncarnation: 'pty:missing-worker',
      worktreeId: 'worktree:missing-worker',
      setupState: 'not_applicable',
      effects: [{ kind: 'terminal', action: 'created', id: 'missing-worker' }]
    })
    d.markWorkerDispatchReady(local.dispatch.id)
    const stopped = await dispatcher.dispatch(
      request(
        'orchestration.consoleStopWorker',
        { run: run.id, dispatch: local.dispatch.id },
        'stop-unknown'
      )
    )
    expect(stopped).toMatchObject({ ok: true, result: { state: 'stop_unknown' } })

    const remoteTask = d.createTask({ spec: 'Remote worker', runId: run.id })
    const remote = d.createStartingWorkerDispatch({
      taskId: remoteTask.id,
      startOptions: {},
      federation: {
        environmentId: 'environment-1',
        environmentName: 'Worker host',
        peerFingerprint: 'peer',
        protocolVersion: 2
      }
    })
    const released = await dispatcher.dispatch(
      request(
        'orchestration.consoleReleaseWorker',
        { run: run.id, dispatch: remote.dispatch.id },
        'release-federated'
      )
    )
    expect(released).toMatchObject({
      ok: true,
      result: { state: 'retained', reason: 'federation_unsupported' }
    })
    const actor = createHash('sha256').update('desktop-user').digest('hex')
    expect(d.getOperatorAction(actor, 'stop-unknown')?.state).toBe('outcome_unknown')
    expect(d.getOperatorAction(actor, 'release-federated')?.state).toBe('completed')
  })

  it('rejects mobile and requests without durable authenticated mutation identity', async () => {
    const { db: d, runtime, dispatcher } = setup()
    const run = d.createRun({
      objective: 'Denied',
      coordinatorHandle: 'coordinator',
      coordinatorPaneKey: 'tab:denied'
    })
    const method = ORCHESTRATION_RUN_CONSOLE_OPERATOR_METHODS.find(
      (candidate) => candidate.name === 'orchestration.consoleRetainWorker'
    )!
    const fingerprint = 'a'.repeat(64)
    const mobileContext: RpcContext = {
      runtime,
      clientKind: 'mobile',
      authenticatedCallerFingerprint: fingerprint,
      orchestrationMutation: {
        callerFingerprint: fingerprint,
        requestId: 'mobile-request',
        method: method.name,
        payloadHash: 'hash'
      }
    }
    await expect(
      method.handler(method.params?.parse({ run: run.id, dispatch: 'dispatch' }), mobileContext)
    ).rejects.toMatchObject({ code: 'forbidden' })

    const noRequestId = await dispatcher.dispatch({
      id: 'rpc-no-durable-id',
      authToken: 'desktop-user',
      method: 'orchestration.consoleRetainWorker',
      params: { run: run.id, dispatch: 'dispatch' },
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION
    })
    expect(noRequestId).toMatchObject({
      ok: false,
      error: { code: 'durable_request_required' }
    })
  })
})
