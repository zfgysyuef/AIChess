import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAIRequestBody, buildEndpoint, extractProviderText, extractProviderThinking, parseAIChoice, requestAIChoice } from './client'
import type { AIConfig } from './types'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

function sse(event: unknown, name?: string): string {
  return `${name ? `event: ${name}\n` : ''}data: ${JSON.stringify(event)}\n\n`
}

const CHAT_CONFIG: AIConfig = {
  name: 'AI A',
  baseUrl: 'https://example.com/v1',
  apiKey: 'test-key',
  model: 'test-model',
  apiStyle: 'chat',
  reasoningEffort: '',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI API adapters', () => {
  it('builds both supported endpoint styles', () => {
    expect(buildEndpoint('https://example.com/v1/', 'responses')).toBe('https://example.com/v1/responses')
    expect(buildEndpoint('https://example.com/v1/chat/completions', 'responses')).toBe('https://example.com/v1/responses')
    expect(buildEndpoint('https://example.com/v1/responses', 'chat')).toBe('https://example.com/v1/chat/completions')
  })

  it('maps reasoning effort to each API request shape and omits blank values', () => {
    const chatBody = buildAIRequestBody({ ...CHAT_CONFIG, reasoningEffort: ' high ' }, 'system', 'prompt')
    const responsesBody = buildAIRequestBody({ ...CHAT_CONFIG, apiStyle: 'responses', reasoningEffort: 'xhigh' }, 'system', 'prompt')
    const defaultBody = buildAIRequestBody(CHAT_CONFIG, 'system', 'prompt')
    const defaultResponsesBody = buildAIRequestBody({ ...CHAT_CONFIG, apiStyle: 'responses' }, 'system', 'prompt')

    expect(chatBody.reasoning_effort).toBe('high')
    expect(responsesBody.reasoning).toEqual({ effort: 'xhigh' })
    expect(defaultBody).not.toHaveProperty('reasoning_effort')
    expect(defaultResponsesBody).not.toHaveProperty('reasoning')
  })

  it('extracts chat completions text', () => {
    expect(extractProviderText({ choices: [{ message: { content: '{"move":"E4"}' } }] }, 'chat'))
      .toBe('{"move":"E4"}')
  })

  it('extracts Chat Completions reasoning content separately', () => {
    const payload = {
      choices: [{
        message: {
          reasoning_content: '先比较中心控制，再确认 E4 合法。',
          content: '{"move":"E4"}',
        },
      }],
    }
    expect(extractProviderText(payload, 'chat')).toBe('{"move":"E4"}')
    expect(extractProviderThinking(payload, 'chat')).toBe('先比较中心控制，再确认 E4 合法。')
  })

  it('extracts Responses API output text', () => {
    const payload = { output: [{ content: [{ type: 'output_text', text: '{"move":"PASS"}' }] }] }
    expect(extractProviderText(payload, 'responses')).toBe('{"move":"PASS"}')
  })

  it('ignores Responses reasoning text and reads only the final message', () => {
    const payload = {
      output: [
        {
          type: 'reasoning',
          content: [{ type: 'reasoning_text', text: '中心 H8 很重要，但 H8 已被占用。' }],
        },
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"move":"H9","reason":"中心附近应对"}' }],
        },
      ],
    }
    expect(extractProviderText(payload, 'responses')).toBe('{"move":"H9","reason":"中心附近应对"}')
    expect(extractProviderThinking(payload, 'responses')).toBe('中心 H8 很重要，但 H8 已被占用。')
    expect(parseAIChoice(extractProviderText(payload, 'responses')).move).toBe('H9')
  })

  it('extracts think tags while keeping them out of move parsing', () => {
    const choice = parseAIChoice('<think>检查所有冲四点，H9 最稳妥。</think>\n{"move":"H9"}')
    expect(choice).toMatchObject({ move: 'H9', thinking: '检查所有冲四点，H9 最稳妥。' })
  })

  it('streams Chat Completions reasoning updates before the final move', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => streamResponse([
      sse({ choices: [{ delta: { reasoning_content: '先检查' } }] }),
      sse({ choices: [{ delta: { reasoning_content: '中心位置。' } }] }),
      sse({ choices: [{ delta: { content: '{"move":"H8","reason":"占据中心"}' } }] }),
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const updates: string[] = []

    const choice = await requestAIChoice(CHAT_CONFIG, 'system', 'prompt', undefined, (thinking) => updates.push(thinking))

    expect(choice).toMatchObject({ move: 'H8', reason: '占据中心', thinking: '先检查中心位置。' })
    expect(updates).toEqual(['先检查', '先检查中心位置。'])
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(request.body.stream).toBe(true)
  })

  it('streams Responses reasoning across arbitrary network chunk boundaries', async () => {
    const firstEvent = sse({ delta: '比较横向威胁，' }, 'response.reasoning_text.delta')
    const splitAt = Math.floor(firstEvent.length / 2)
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => streamResponse([
      firstEvent.slice(0, splitAt),
      firstEvent.slice(splitAt),
      sse({ type: 'response.reasoning_text.delta', delta: '确认 H9 合法。' }),
      sse({ type: 'response.output_text.delta', delta: '{"move":"H9"}' }),
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const updates: string[] = []

    const choice = await requestAIChoice(
      { ...CHAT_CONFIG, apiStyle: 'responses' },
      'system',
      'prompt',
      undefined,
      (thinking) => updates.push(thinking),
    )

    expect(choice).toMatchObject({ move: 'H9', thinking: '比较横向威胁，确认 H9 合法。' })
    expect(updates).toEqual(['比较横向威胁，', '比较横向威胁，确认 H9 合法。'])
  })

  it('parses fenced JSON and normalizes a move', () => {
    const choice = parseAIChoice('```json\n{"move":" e2e4 ","reason":"控制中心"}\n```')
    expect(choice).toMatchObject({ move: 'E2E4', reason: '控制中心' })
  })

  it('prefers the last complete JSON object when reasoning precedes the answer', () => {
    const choice = parseAIChoice('推理示例 {"move":"H8"}\n最终答案 {"move":"H9","reason":"合法应对"}')
    expect(choice).toMatchObject({ move: 'H9', reason: '合法应对' })
  })
})
