import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type RunConsoleProcessEvent = {
  pid: number
  event: 'spawn' | 'stdin' | 'signal'
  input?: string
  signal?: string
}

export const runConsoleProcessFixtureDir = mkdtempSync(
  path.join(os.tmpdir(), 'orca-e2e-run-console-process-')
)
export const runConsoleProcessLedgerPath = path.join(runConsoleProcessFixtureDir, 'process.jsonl')

const fakeCodexSource = `
const { appendFileSync } = require('node:fs')
function record(event) {
  try {
    appendFileSync(
      process.env.ORCA_E2E_RUN_CONSOLE_LEDGER,
      JSON.stringify({ pid: process.pid, ...event }) + '\\n'
    )
  } catch {}
}
if (process.argv.slice(2).includes('app-server')) {
  process.stderr.write("error: unrecognized subcommand 'app-server'\\n")
  process.exit(2)
}
record({ event: 'spawn' })
process.stdout.write('\\u001b]0;Codex Ready\\u0007OpenAI Codex\\nmodel: e2e\\ndirectory: e2e\\n')
let acknowledged = false
process.stdin.on('data', (chunk) => {
  const input = chunk.toString()
  record({ event: 'stdin', input })
  if (!acknowledged && input.includes('\\r')) {
    acknowledged = true
    process.stdout.write('ACK\\n')
  }
})
for (const signal of ['SIGINT', 'SIGHUP', 'SIGTERM']) {
  process.on(signal, () => {
    record({ event: 'signal', signal })
    process.exit(0)
  })
}
process.stdin.resume()
setInterval(() => {}, 60_000)
`

if (process.platform === 'win32') {
  writeFileSync(path.join(runConsoleProcessFixtureDir, 'fake-codex.js'), fakeCodexSource)
  writeFileSync(
    path.join(runConsoleProcessFixtureDir, 'codex.cmd'),
    '@echo off\r\nnode "%~dp0\\fake-codex.js" %*\r\n'
  )
} else {
  const executable = path.join(runConsoleProcessFixtureDir, 'codex')
  writeFileSync(executable, `#!/usr/bin/env node\n${fakeCodexSource}`)
  chmodSync(executable, 0o755)
}

const runConsoleCodexPath = path.join(
  runConsoleProcessFixtureDir,
  process.platform === 'win32' ? 'codex.cmd' : 'codex'
)
export const runConsoleCodexCommand =
  process.platform === 'win32'
    ? `"${runConsoleCodexPath.replaceAll('"', '""')}"`
    : `'${runConsoleCodexPath.replaceAll("'", `'\\''`)}'`

export function runConsoleProcessLaunchEnv(): NodeJS.ProcessEnv {
  return {
    PATH: `${runConsoleProcessFixtureDir}${path.delimiter}${process.env.PATH ?? ''}`,
    ORCA_E2E_RUN_CONSOLE_LEDGER: runConsoleProcessLedgerPath
  }
}

export function readRunConsoleProcessEvents(): RunConsoleProcessEvent[] {
  if (!existsSync(runConsoleProcessLedgerPath)) {
    return []
  }
  return readFileSync(runConsoleProcessLedgerPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunConsoleProcessEvent)
}

export function resetRunConsoleProcessLedger(): void {
  rmSync(runConsoleProcessLedgerPath, { force: true })
}

export function readRunConsoleSpawnPids(): number[] {
  return readRunConsoleProcessEvents()
    .filter((event) => event.event === 'spawn')
    .map((event) => event.pid)
}

export function readDispatchCapability(pid: number): string | null {
  const input = readRunConsoleProcessEvents()
    .filter((event) => event.pid === pid && event.event === 'stdin')
    .map((event) => event.input ?? '')
    .join('')
  return input.match(/--dispatch-capability\s+(dcap_[A-Za-z0-9_-]+)/)?.[1] ?? null
}

export function isRunConsoleProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function cleanupRunConsoleProcessFixture(): void {
  rmSync(runConsoleProcessFixtureDir, { recursive: true, force: true })
}

process.once('exit', cleanupRunConsoleProcessFixture)
