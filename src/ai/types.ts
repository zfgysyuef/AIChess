export type ApiStyle = 'responses' | 'chat'

export interface AIConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  apiStyle: ApiStyle
}

export interface AIChoice {
  move: string
  reason: string
  thinking: string
  rawText: string
}

export const DEFAULT_AI_A: AIConfig = {
  name: 'AI A',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  apiStyle: 'responses',
}

export const DEFAULT_AI_B: AIConfig = {
  ...DEFAULT_AI_A,
  name: 'AI B',
}

export function isAIConfigured(config: AIConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.model.trim())
}
