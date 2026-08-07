# Orchestration Run Console

Run Console is Orca's desktop supervisory view for a single orchestration objective. It explains why work exists, how tasks depend on one another, what needs human attention, and which operator interventions occurred.

It does not replace the Workspace Board, Agent Activity, or terminal:

- Workspace Board owns worktree lifecycle and result comparison.
- Agent Activity shows who is working or waiting.
- Run Console is task- and objective-centered. The terminal remains the detailed transcript and live-session drill-down.

## Runtime and workspace boundary

The console selects one home runtime at a time: local Orca or one connected environment. It does not merge unrelated runs from multiple runtimes. A worker federated by the selected home runtime remains visible inside its run, and terminal drill-down targets the worker's owning runtime when that identity is available.

Run selection is runtime-scoped and does not require a Git repository or worktree identity. Folder and non-Git workspaces therefore use the same console path. The existing orchestration setup marker controls whether the `Runs` navigation entry is shown.

Catalog and snapshot reads are paginated or bounded. Heavy worker output is loaded only after selecting the Worker inspector tab. Visible active runs poll periodically; hidden or completed views poll less often. Reconnect failures retain the last successful snapshot and label it stale.

## Derived state

`Needs attention`, `Active`, and `Completed` are read-only projections, not persisted run lifecycle controls. Questions, decision gates, failed work, and unresolved worker resources feed the attention projection. Incomplete or legacy data is shown as unknown or read-only instead of inferring that an action is safe.

The task graph is also read-only. Cycles, missing dependencies, duplicate task IDs, or more than 80 tasks switch to the equivalent outline view rather than drawing a misleading graph.

## Operator authority

The desktop UI is a first-class operator. It does not acquire or impersonate a coordinator generation. V1 permits only these exact-target actions:

- answer one question;
- resolve one decision gate;
- send follow-up to one dispatch;
- stop or abandon one worker dispatch;
- release or retain one worker resource.

Starting, retrying, reassigning, scheduling, creating tasks, and editing dependencies remain outside Run Console. Controls name the runtime, run, task, and dispatch involved and fail closed for stale identities, legacy runs, missing capability, terminal workers, or unsupported federated cleanup. Mobile credentials cannot invoke operator methods.

Every submit carries a stable mutation request ID. If an SSH or relay response is uncertain, the UI reports `Outcome unknown` and retries with the same ID so the runtime can replay the durable result instead of applying the action twice.

## Audit record

Every accepted operator attempt writes an `orchestration_operator_actions` record. It stores the mutation request ID, an opaque fingerprint derived from the authenticated RPC caller, entity IDs, action and lifecycle state, bounded result/error codes, and timestamps.

The audit record never copies answers, follow-up bodies, transcript output, credentials, or tokens. Those remain in their existing domain stores. Terminal audit rows are retained for at most 30 days and the table is capped at 10,000 rows; mutation receipts remain the source of idempotent replay.

## Version compatibility

Complete support is advertised by the additive `orchestration.run-console.v1` runtime capability. The feature adds RPC methods and optional request metadata without changing the runtime protocol version or adding a stream opcode.

- New client with an old runtime: shows update-required and sends no console read or mutation RPCs.
- Old client with a new runtime: continues to work because the new contract is additive.
- Legacy run on a capable runtime: inspectable where data is available, but operator actions remain disabled.
- Local, SSH, and relay targets: use the same schemas, capability gate, request identity, and stale-response protection.

Resource release remains owned by the runtime that owns the worker resource. When federated cleanup support is absent or uncertain, Run Console preserves the resource and reports the limitation rather than assuming cleanup succeeded.
