import { DEFAULT_AI_A, DEFAULT_AI_B, type AIConfig } from './ai/types'
import type { GameKind, Seat } from './game'

export type MatchMode = 'human-ai' | 'ai-ai'

export interface AppSettings {
  game: GameKind
  mode: MatchMode
  humanSeat: Seat
  goSize: 9 | 13 | 19
  aiDelay: number
  aiA: AIConfig
  aiB: AIConfig
}

const STORAGE_KEY = 'qijing-settings-v1'
const SETTINGS_VERSION = 2

type StoredSettings = Partial<AppSettings> & {
  settingsVersion?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  game: 'gomoku',
  mode: 'human-ai',
  humanSeat: 'first',
  goSize: 19,
  aiDelay: 1200,
  aiA: DEFAULT_AI_A,
  aiB: DEFAULT_AI_B,
}

export function loadSettings(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as StoredSettings
    const savedGoSize = saved.goSize
    const goSize = savedGoSize === 13 || savedGoSize === 19
      ? savedGoSize
      : savedGoSize === 9 && saved.settingsVersion === SETTINGS_VERSION
        ? 9
        : 19
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      goSize,
      aiA: { ...DEFAULT_AI_A, ...saved.aiA },
      aiB: { ...DEFAULT_AI_B, ...saved.aiB },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, settingsVersion: SETTINGS_VERSION }))
}
