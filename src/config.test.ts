import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './config'

function mockStorage(saved?: unknown) {
  let value = saved === undefined ? null : JSON.stringify(saved)
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue
    }),
  })
  return () => value
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app settings', () => {
  it('uses a 19x19 board for Go by default', () => {
    mockStorage()
    expect(loadSettings().goSize).toBe(19)
  })

  it('migrates the legacy 9x9 default without discarding other settings', () => {
    mockStorage({ goSize: 9, mode: 'ai-ai', aiA: { model: 'kept-model' } })
    const settings = loadSettings()
    expect(settings.goSize).toBe(19)
    expect(settings.mode).toBe('ai-ai')
    expect(settings.aiA.model).toBe('kept-model')
  })

  it('keeps 9x9 after the user selects it in the new settings version', () => {
    const readSaved = mockStorage()
    saveSettings({ ...DEFAULT_SETTINGS, goSize: 9 })
    expect(JSON.parse(readSaved() ?? '{}').settingsVersion).toBe(2)
    expect(loadSettings().goSize).toBe(9)
  })

  it('adds a blank reasoning effort to legacy profiles and preserves configured values', () => {
    mockStorage({
      aiA: { model: 'legacy-model' },
      aiB: { model: 'reasoning-model', reasoningEffort: 'high' },
    })
    const settings = loadSettings()
    expect(settings.aiA.reasoningEffort).toBe('')
    expect(settings.aiB.reasoningEffort).toBe('high')
  })
})
