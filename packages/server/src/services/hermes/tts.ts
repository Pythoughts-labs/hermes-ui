import { logger } from '../logger'
import { synthesizeWithLocalEngine } from './local-tts/engine-manager'

export interface TtsOptions {
  text: string
  lang?: string
  voice?: string
  speed?: number
}

export async function textToSpeech(opts: TtsOptions): Promise<{ audio: Buffer; engine: string }> {
  const result = await synthesizeWithLocalEngine({
    text: opts.text,
    voice: opts.voice,
    speed: opts.speed,
  })
  logger.debug({ engine: 'kokoro', voice: opts.voice, speed: opts.speed }, 'TTS generated locally')
  return { audio: result.audio, engine: 'kokoro' }
}

/**
 * Convert OpenAI TTS request to local engine options.
 * OpenAI format: { model, input, voice, speed }
 */
export interface OpenaiTtsRequest {
  model?: string
  input: string
  voice?: string
  speed?: number
}

export async function openaiCompatibleTts(
  body: OpenaiTtsRequest,
): Promise<{ audio: Buffer; engine: string }> {
  return textToSpeech({
    text: body.input,
    voice: body.voice,
    speed: body.speed,
  })
}
