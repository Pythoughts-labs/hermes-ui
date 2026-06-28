import type { TtsProvider } from './types'
import { cleanTtsText, clampTtsText } from './text'
import { synthesizeWithLocalEngine } from '../local-tts/engine-manager'

export interface LocalTtsProviderOptions {
  voice?: string
  speed?: number
  model?: string  // surfaced for the UI; engine ignores for now
}

export const localTtsProvider: TtsProvider<LocalTtsProviderOptions> = {
  id: 'local',
  async synthesize(req, opts) {
    const text = clampTtsText(cleanTtsText(req.text))
    if (!text) throw new Error('Local TTS text is empty after cleaning')

    const result = await synthesizeWithLocalEngine({
      text,
      voice: opts.voice,
      speed: opts.speed,
      signal: req.signal,
    })

    return {
      audio: result.audio,
      contentType: result.contentType,
      engine: result.engine,
      provider: 'local',
    }
  },
}
