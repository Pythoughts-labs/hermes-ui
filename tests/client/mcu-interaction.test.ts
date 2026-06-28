// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  createMcuSpeechSegmenter,
  mcuEventsFromRunEvent,
  startMcuVoiceInteraction,
  type McuInteractionTransport,
} from '@/api/hermes/mcu-interaction'
import type { RunEvent } from '@/api/hermes/chat'

describe('mcu interaction helpers', () => {
  it('segments assistant output for speech without tool content', () => {
    const segmenter = createMcuSpeechSegmenter({ maxChars: 32 })

    expect(segmenter.pushDelta('Hello,')).toEqual([])
    expect(segmenter.pushDelta(' I started processing. Next')).toEqual(['Hello, I started processing.'])
    expect(segmenter.flush()).toBe('Next')
  })

  it('maps tool events to MCU display events', () => {
    expect(mcuEventsFromRunEvent({
      event: 'tool.started',
      tool: 'browser.search',
      preview: 'Search devices',
    }, 'mcu-session')).toEqual([
      {
        type: 'interaction.status',
        interactionId: 'mcu-session',
        status: 'tool',
        text: 'browser.search',
      },
      {
        type: 'tool.started',
        interactionId: 'mcu-session',
        tool: 'browser.search',
        preview: 'Search devices',
      },
    ])

    expect(mcuEventsFromRunEvent({
      event: 'tool.completed',
      tool: 'browser.search',
    }, 'mcu-session')).toEqual([
      {
        type: 'tool.completed',
        interactionId: 'mcu-session',
        tool: 'browser.search',
      },
      {
        type: 'interaction.status',
        interactionId: 'mcu-session',
        status: 'thinking',
      },
    ])
  })

  it('runs MCU voice interaction without touching the chat store flow', async () => {
    let onRunEvent: ((event: RunEvent) => void) | null = null
    let finishRun: (() => void) | null = null

    const transport: McuInteractionTransport = {
      clearAudio: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      enqueueAudio: vi.fn().mockResolvedValue(undefined),
    }

    const startRun = vi.fn((_body, onEvent, onDone) => {
      onRunEvent = onEvent
      finishRun = onDone
      return { abort: vi.fn() }
    })

    const handle = startMcuVoiceInteraction({
      audio: new Blob(['voice'], { type: 'audio/webm' }),
      sttProvider: 'doubao',
      ttsProvider: 'doubao',
      sessionId: 'mcu-session',
      transport,
      deps: {
        transcribe: vi.fn().mockResolvedValue({
          text: 'Turn on the light',
          provider: 'doubao',
          model: 'test-model',
          durationMs: 12,
        }),
        synthesize: vi.fn().mockResolvedValue({
          audio: new Blob(['mp3'], { type: 'audio/mpeg' }),
          engine: 'doubao',
          provider: 'doubao',
        }),
        startRun,
      },
    })

    await vi.waitFor(() => {
      expect(startRun).toHaveBeenCalledTimes(1)
    })

    expect(startRun.mock.calls[0][0]).toEqual(expect.objectContaining({
      input: 'Turn on the light',
      session_id: 'mcu-session',
      source: 'global_agent',
      session_source: 'global_agent',
    }))

    onRunEvent?.({ event: 'tool.started', tool: 'udp.discovery', preview: 'Scan LAN' })
    onRunEvent?.({ event: 'message.delta', delta: 'Device found.' })
    finishRun?.()

    await handle.done

    expect(transport.clearAudio).toHaveBeenCalledWith('mcu-session')
    expect(transport.enqueueAudio).toHaveBeenCalledWith(expect.objectContaining({
      interactionId: 'mcu-session',
      segmentId: 'mcu-session-1',
      text: 'Device found.',
      mimeType: 'audio/mpeg',
    }))
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tool.started',
      tool: 'udp.discovery',
      preview: 'Scan LAN',
    }))
    expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'interaction.status',
      status: 'completed',
    }))
  })
})
