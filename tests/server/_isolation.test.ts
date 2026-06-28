import { describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn()
const spawnMock = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}))

function fakeProcess(opts: { exitCode: number; stderr?: string; stdout?: string; error?: Error; onExit?: () => void }) {
  const stderrHandlers: Array<(c: Buffer) => void> = []
  const stdoutHandlers: Array<(c: Buffer) => void> = []
  const exitHandlers: Array<(c: number | null, s: unknown) => void> = []
  const errorHandlers: Array<(e: Error) => void> = []
  let emitted = false

  // Defer emission until AFTER the consumer attaches its listeners. spawn()
  // returns synchronously and the caller registers .on('exit'/'error')
  // immediately; emitting at construction time fires into an empty handler
  // list and the exit event is lost — which hung runPipInstall forever.
  const emit = () => {
    if (emitted) return
    emitted = true
    if (opts.error) {
      for (const cb of errorHandlers) cb(opts.error)
      return
    }
    if (opts.stdout) {
      for (const cb of stdoutHandlers) cb(Buffer.from(opts.stdout))
    }
    if (opts.stderr) {
      for (const cb of stderrHandlers) cb(Buffer.from(opts.stderr))
    }
    for (const cb of exitHandlers) cb(opts.exitCode, null)
    opts.onExit?.()
  }

  const proc: any = {
    pid: 12345,
    stdin: { write: vi.fn() },
    stdout: { on: (_e: string, cb: (c: Buffer) => void) => stdoutHandlers.push(cb) },
    stderr: { on: (_e: string, cb: (c: Buffer) => void) => stderrHandlers.push(cb) },
    on: (e: string, cb: unknown) => {
      if (e === 'exit') exitHandlers.push(cb as any)
      if (e === 'error') errorHandlers.push(cb as any)
      Promise.resolve().then(emit)
      return proc
    },
    kill: vi.fn(),
  }
  return proc
}

describe('isolation', () => {
  it('soundfile missing', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any) // import kokoro -> importable
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any) // import soundfile -> missing
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.12\n') } as any) // python version
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any) // hasUv() -> uv absent -> pip install path
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any) // post-install re-probe: kokoro
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any) // post-install re-probe: soundfile
    spawnMock.mockReturnValueOnce(fakeProcess({ exitCode: 0 })) // pip install -> success
    const { ensureKokoroInstalled } = await import('../../packages/server/src/services/hermes/local-tts/engine-manager')
    const result = await ensureKokoroInstalled('/usr/bin/python3')
    expect(result.installed).toBe(true)
  }, 3000)
})
