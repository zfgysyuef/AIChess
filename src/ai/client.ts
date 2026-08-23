import type { AIChoice, AIConfig } from './types'

export function buildEndpoint(baseUrl: string, apiStyle: AIConfig['apiStyle']): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('请填写 Base URL')
  const root = base.replace(/\/(?:chat\/completions|responses)$/i, '')
  return apiStyle === 'responses' ? `${root}/responses` : `${root}/chat/completions`
}

function requestBody(config: AIConfig, systemPrompt: string, prompt: string): unknown {
  if (config.apiStyle === 'responses') {
    return {
      model: config.model.trim(),
      instructions: systemPrompt,
      input: prompt,
      stream: true,
    }
  }
  return {
    model: config.model.trim(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    stream: true,
  }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part === 'string') return part
    if (!part || typeof part !== 'object') return ''
    const record = part as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (record.text && typeof record.text === 'object' && typeof (record.text as Record<string, unknown>).value === 'string') {
      return (record.text as Record<string, string>).value
    }
    return ''
  }).join('')
}

function extractTaggedThinking(text: string): string {
  return [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

function extractPartialTaggedThinking(text: string): string {
  const lower = text.toLowerCase()
  const parts: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    const start = lower.indexOf('<think>', cursor)
    if (start < 0) break
    const contentStart = start + '<think>'.length
    const end = lower.indexOf('</think>', contentStart)
    parts.push(text.slice(contentStart, end < 0 ? text.length : end).trim())
    if (end < 0) break
    cursor = end + '</think>'.length
  }

  return parts.filter(Boolean).join('\n\n')
}

function reasoningValueToText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((item) => reasoningValueToText(item))
      .filter(Boolean)
      .join('\n\n')
  }
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text.trim()
  if (record.text && typeof record.text === 'object') {
    const nestedText = (record.text as Record<string, unknown>).value
    if (typeof nestedText === 'string') return nestedText.trim()
  }
  return reasoningValueToText(record.content)
}

function joinUniqueText(parts: string[]): string {
  const seen = new Set<string>()
  return parts
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || seen.has(part)) return false
      seen.add(part)
      return true
    })
    .join('\n\n')
}

function responseOutputToText(output: unknown): string {
  if (!Array.isArray(output)) return ''
  return output.map((item) => {
    if (!item || typeof item !== 'object') return ''
    const itemRecord = item as Record<string, unknown>
    if (itemRecord.type && itemRecord.type !== 'message') return ''
    if (!Array.isArray(itemRecord.content)) return ''
    return itemRecord.content.map((part) => {
      if (!part || typeof part !== 'object') return ''
      const partRecord = part as Record<string, unknown>
      if (partRecord.type && !['output_text', 'text'].includes(String(partRecord.type))) return ''
      if (typeof partRecord.text === 'string') return partRecord.text
      if (partRecord.text && typeof partRecord.text === 'object') {
        const value = (partRecord.text as Record<string, unknown>).value
        if (typeof value === 'string') return value
      }
      return ''
    }).join('')
  }).join('')
}

export function extractProviderText(data: unknown, apiStyle: AIConfig['apiStyle']): string {
  if (!data || typeof data !== 'object') return ''
  const record = data as Record<string, unknown>

  if (apiStyle === 'chat') {
    const choice = Array.isArray(record.choices) ? record.choices[0] : undefined
    if (choice && typeof choice === 'object') {
      const message = (choice as Record<string, unknown>).message
      if (message && typeof message === 'object') return contentToText((message as Record<string, unknown>).content)
    }
    return ''
  }

  if (typeof record.output_text === 'string') return record.output_text
  const outputText = responseOutputToText(record.output)
  if (outputText) return outputText

  // Some compatibility layers return a Chat Completions envelope from /responses.
  return extractProviderText(record, 'chat')
}

export function extractProviderThinking(data: unknown, apiStyle: AIConfig['apiStyle']): string {
  if (!data || typeof data !== 'object') return ''
  const record = data as Record<string, unknown>

  if (apiStyle === 'chat') {
    const choice = Array.isArray(record.choices) ? record.choices[0] : undefined
    if (!choice || typeof choice !== 'object') return ''
    const message = (choice as Record<string, unknown>).message
    if (!message || typeof message !== 'object') return ''
    const messageRecord = message as Record<string, unknown>
    return joinUniqueText([
      reasoningValueToText(messageRecord.reasoning_content),
      reasoningValueToText(messageRecord.reasoning),
      reasoningValueToText(messageRecord.thinking),
      extractTaggedThinking(contentToText(messageRecord.content)),
    ])
  }

  const outputThinking = Array.isArray(record.output)
    ? record.output.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const itemRecord = item as Record<string, unknown>
      if (itemRecord.type !== 'reasoning') return []
      return [
        reasoningValueToText(itemRecord.content),
        reasoningValueToText(itemRecord.summary),
        reasoningValueToText(itemRecord.text),
      ]
    })
    : []

  const responsesThinking = joinUniqueText([
    reasoningValueToText(record.reasoning_text),
    reasoningValueToText(record.reasoning),
    reasoningValueToText(record.reasoning_summary),
    ...outputThinking,
    extractTaggedThinking(extractProviderText(record, 'responses')),
  ])
  if (responsesThinking) return responsesThinking

  // Some compatibility layers return a Chat Completions envelope from /responses.
  return extractProviderThinking(record, 'chat')
}

export function parseAIChoice(rawText: string): AIChoice {
  const thinking = extractTaggedThinking(rawText)
  const cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const embeddedObjects = [...cleaned.matchAll(/\{[^{}]*\}/g)].map((match) => match[0]).reverse()
  const candidates = [cleaned, fenced, ...embeddedObjects]
    .filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const move = typeof parsed.move === 'string' ? parsed.move : typeof parsed['着法'] === 'string' ? parsed['着法'] : ''
      if (move.trim()) {
        return {
          move: move.replace(/\s+/g, '').toUpperCase(),
          reason: typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 80) : '',
          thinking,
          rawText,
        }
      }
    } catch {
      // Continue with the next extraction candidate.
    }
  }

  const bareMoves = [...cleaned.matchAll(/\b(?:PASS|[A-T][1-9]\d?|[a-i](?:10|[1-9])[a-i](?:10|[1-9])|[a-h][1-8][a-h][1-8][qrbn]?)\b/gi)]
  const bareMove = bareMoves.at(-1)?.[0]
  if (bareMove) return { move: bareMove.toUpperCase(), reason: '', thinking, rawText }
  throw new Error('模型没有返回可解析的着法 JSON')
}

function upstreamError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const record = data as Record<string, unknown>
  if (typeof record.error === 'string') return record.error
  if (record.error && typeof record.error === 'object') {
    const message = (record.error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  if (typeof record.message === 'string') return record.message
  return fallback
}

type ThinkingUpdate = (thinking: string) => void

interface ProviderStreamState {
  outputText: string
  reasoningText: string
  reasoningSummary: string
  lastNotifiedThinking: string
  completedData?: unknown
}

function streamValueToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => streamValueToText(item)).join('')
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  if (record.text && typeof record.text === 'object') {
    const nestedText = (record.text as Record<string, unknown>).value
    if (typeof nestedText === 'string') return nestedText
  }
  return streamValueToText(record.content)
}

function currentStreamThinking(state: ProviderStreamState): string {
  const explicit = joinUniqueText([state.reasoningText, state.reasoningSummary])
  return explicit || extractPartialTaggedThinking(state.outputText)
}

function notifyThinking(state: ProviderStreamState, onThinking?: ThinkingUpdate) {
  const thinking = currentStreamThinking(state)
  if (!thinking || thinking === state.lastNotifiedThinking) return
  state.lastNotifiedThinking = thinking
  onThinking?.(thinking)
}

function applyChatStreamChunk(record: Record<string, unknown>, state: ProviderStreamState): boolean {
  if (!Array.isArray(record.choices)) return false
  let handled = false

  for (const choice of record.choices) {
    if (!choice || typeof choice !== 'object') continue
    const choiceRecord = choice as Record<string, unknown>
    const delta = choiceRecord.delta
    if (delta && typeof delta === 'object') {
      const deltaRecord = delta as Record<string, unknown>
      state.outputText += streamValueToText(deltaRecord.content)
      state.reasoningText += streamValueToText(deltaRecord.reasoning_content)
        || streamValueToText(deltaRecord.reasoning)
        || streamValueToText(deltaRecord.thinking)
      handled = true
    }

    const message = choiceRecord.message
    if (message && typeof message === 'object') {
      if (!state.outputText) state.outputText = contentToText((message as Record<string, unknown>).content)
      if (!state.reasoningText) {
        state.reasoningText = extractProviderThinking({ choices: [{ message }] }, 'chat')
      }
      handled = true
    }
  }

  return handled
}

function applyProviderStreamEvent(
  event: unknown,
  apiStyle: AIConfig['apiStyle'],
  state: ProviderStreamState,
  onThinking?: ThinkingUpdate,
) {
  if (!event || typeof event !== 'object') return
  const record = event as Record<string, unknown>

  // Compatibility layers sometimes stream Chat chunks from the /responses route.
  const handledChatChunk = applyChatStreamChunk(record, state)
  if (!handledChatChunk || apiStyle === 'responses') {
    switch (record.type) {
      case 'response.output_text.delta':
        state.outputText += streamValueToText(record.delta)
        break
      case 'response.output_text.done':
        if (typeof record.text === 'string') state.outputText = record.text
        break
      case 'response.reasoning_text.delta':
      case 'response.reasoning.delta':
        state.reasoningText += streamValueToText(record.delta)
        break
      case 'response.reasoning_text.done':
      case 'response.reasoning.done':
        if (typeof record.text === 'string') state.reasoningText = record.text
        break
      case 'response.reasoning_summary_text.delta':
        state.reasoningSummary += streamValueToText(record.delta)
        break
      case 'response.reasoning_summary_text.done':
        if (typeof record.text === 'string') state.reasoningSummary = record.text
        break
      case 'response.completed':
        state.completedData = record.response
        break
      case 'response.failed':
      case 'response.incomplete':
        throw new Error(upstreamError(record.response, '模型流式响应未能完成'))
      case 'error':
        throw new Error(upstreamError(record, '模型流式响应失败'))
    }
  }

  notifyThinking(state, onThinking)
}

function applySSEBlock(
  block: string,
  apiStyle: AIConfig['apiStyle'],
  state: ProviderStreamState,
  onThinking?: ThinkingUpdate,
) {
  const lines = block.split(/\r?\n/)
  const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim()
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()
  if (!data || data === '[DONE]') return

  let event: unknown
  try {
    event = JSON.parse(data)
  } catch {
    throw new Error('模型返回了无法解析的流事件')
  }
  if (eventName && event && typeof event === 'object' && !(event as Record<string, unknown>).type) {
    event = { ...(event as Record<string, unknown>), type: eventName }
  }
  applyProviderStreamEvent(event, apiStyle, state, onThinking)
}

function finalizeProviderStream(
  state: ProviderStreamState,
  apiStyle: AIConfig['apiStyle'],
  onThinking?: ThinkingUpdate,
): AIChoice {
  const completedText = state.completedData ? extractProviderText(state.completedData, apiStyle) : ''
  const outputText = state.outputText || completedText
  if (!outputText) throw new Error('模型流式响应中没有文本内容')

  const completedThinking = state.completedData ? extractProviderThinking(state.completedData, apiStyle) : ''
  const thinking = currentStreamThinking(state) || completedThinking
  if (thinking && thinking !== state.lastNotifiedThinking) onThinking?.(thinking)
  const choice = parseAIChoice(outputText)
  return { ...choice, thinking: thinking || choice.thinking }
}

function createStreamState(): ProviderStreamState {
  return {
    outputText: '',
    reasoningText: '',
    reasoningSummary: '',
    lastNotifiedThinking: '',
  }
}

async function consumeProviderStream(
  response: Response,
  apiStyle: AIConfig['apiStyle'],
  onThinking?: ThinkingUpdate,
): Promise<AIChoice> {
  if (!response.body) throw new Error('模型流式响应没有可读取的内容')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const state = createStreamState()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) applySSEBlock(block, apiStyle, state, onThinking)
  }

  buffer += decoder.decode()
  if (buffer.trim()) applySSEBlock(buffer, apiStyle, state, onThinking)
  return finalizeProviderStream(state, apiStyle, onThinking)
}

function consumeBufferedSSE(
  text: string,
  apiStyle: AIConfig['apiStyle'],
  onThinking?: ThinkingUpdate,
): AIChoice {
  const state = createStreamState()
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (block.trim()) applySSEBlock(block, apiStyle, state, onThinking)
  }
  return finalizeProviderStream(state, apiStyle, onThinking)
}

export async function requestAIChoice(
  config: AIConfig,
  systemPrompt: string,
  prompt: string,
  signal?: AbortSignal,
  onThinking?: ThinkingUpdate,
): Promise<AIChoice> {
  if (!config.model.trim()) throw new Error('请填写模型名称')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      url: buildEndpoint(config.baseUrl, config.apiStyle),
      apiKey: config.apiKey,
      body: requestBody(config, systemPrompt, prompt),
    }),
  })

  if (response.ok && response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    return consumeProviderStream(response, config.apiStyle, onThinking)
  }

  const text = await response.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = undefined
  }
  if (!response.ok) throw new Error(upstreamError(data, `AI 请求失败（HTTP ${response.status}）`))
  if (text.trimStart().startsWith('data:') || text.trimStart().startsWith('event:')) {
    return consumeBufferedSSE(text, config.apiStyle, onThinking)
  }
  const providerText = extractProviderText(data, config.apiStyle)
  if (!providerText) throw new Error('模型响应中没有文本内容')
  const choice = parseAIChoice(providerText)
  const providerThinking = extractProviderThinking(data, config.apiStyle) || choice.thinking
  if (providerThinking) onThinking?.(providerThinking)
  return {
    ...choice,
    thinking: providerThinking,
  }
}
