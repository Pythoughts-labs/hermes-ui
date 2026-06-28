import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clampTtsText, cleanTtsText } from '../../packages/server/src/services/hermes/tts-providers/text'

const { synthesizeWithLocalEngine } = vi.hoisted(() => ({
  synthesizeWithLocalEngine: vi.fn(),
}))

vi.mock('../../packages/server/src/services/hermes/local-tts/engine-manager', () => ({
  synthesizeWithLocalEngine,
}))

import { localTtsProvider } from '../../packages/server/src/services/hermes/tts-providers/local'

describe('localTtsProvider', () => {
  beforeEach(() => {
    synthesizeWithLocalEngine.mockReset()
  })

  it('forwards cleaned text + voice + speed to the engine', async () => {
    const audio = Buffer.from('wav-bytes')
    synthesizeWithLocalEngine.mockResolvedValueOnce({
      audio,
      contentType: 'audio/wav' as const,
      sampleRate: 24000,
      durationMs: 1234,
      engine: 'kokoro' as const,
    })
    const text = 'Hello <b>world</b> ```ts\nsecret()\n``` '.repeat(80)

    const result = await localTtsProvider.synthesize(
      { text },
      { voice: 'af_heart', speed: 1.2 },
    )

    expect(synthesizeWithLocalEngine).toHaveBeenCalledTimes(1)
    expect(synthesizeWithLocalEngine).toHaveBeenCalledWith({
      text: clampTtsText(cleanTtsText(text)),
      voice: 'af_heart',
      speed: 1.2,
      signal: undefined,
    })
    expect(result).toEqual({
      audio,
      contentType: 'audio/wav',
      engine: 'kokoro',
      provider: 'local',
    })
  })

  it('throws before invoking the engine when text is empty after cleaning', async () => {
    await expect(
      localTtsProvider.synthesize(
        { text: '<thinking>secret</thinking> <br/>' },
        { voice: 'af_heart' },
      ),
    ).rejects.toThrow('Local TTS text is empty after cleaning')

    expect(synthesizeWithLocalEngine).not.toHaveBeenCalled()
  })

  it('passes the AbortSignal through to the engine', async () => {
    synthesizeWithLocalEngine.mockResolvedValueOnce({
      audio: Buffer.from('x'),
      contentType: 'audio/wav' as const,
      sampleRate: 24000,
      durationMs: 1,
      engine: 'kokoro' as const,
    })
    const controller = new AbortController()

    await localTtsProvider.synthesize(
      { text: 'Hello world', signal: controller.signal },
      { voice: 'af_heart' },
    )

    expect(synthesizeWithLocalEngine).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('surfaces the engine error with a 412 hint when the model is not installed', async () => {
    const err = new Error('Local TTS model is not installed.') as Error & { httpStatus?: number }
    err.httpStatus = 412
    synthesizeWithLocalEngine.mockRejectedValueOnce(err)

    await expect(
      localTtsProvider.synthesize({ text: 'hi' }, { voice: 'af_heart' }),
    ).rejects.toMatchObject({ httpStatus: 412 })
  })
})
