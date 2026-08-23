import { useEffect, useState } from 'react'
import { BrainCircuit, Check, Copy, Eye, EyeOff, KeyRound, X } from 'lucide-react'
import type { AIConfig } from '../ai/types'

const REASONING_EFFORT_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

interface SettingsModalProps {
  open: boolean
  aiA: AIConfig
  aiB: AIConfig
  onClose: () => void
  onSave: (aiA: AIConfig, aiB: AIConfig) => void
}

interface ProfileFormProps {
  profile: AIConfig
  revealKey: boolean
  onReveal: () => void
  onChange: (profile: AIConfig) => void
}

function ProfileForm({ profile, revealKey, onReveal, onChange }: ProfileFormProps) {
  return (
    <div className="settings-form">
      <label className="field-group">
        <span>Base URL</span>
        <input
          value={profile.baseUrl}
          onChange={(event) => onChange({ ...profile, baseUrl: event.target.value })}
          placeholder="https://api.openai.com/v1"
          spellCheck={false}
        />
      </label>

      <label className="field-group">
        <span>API Key</span>
        <span className="input-with-action">
          <KeyRound size={16} aria-hidden="true" />
          <input
            type={revealKey ? 'text' : 'password'}
            value={profile.apiKey}
            onChange={(event) => onChange({ ...profile, apiKey: event.target.value })}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="icon-button compact" onClick={onReveal} title={revealKey ? '隐藏密钥' : '显示密钥'}>
            {revealKey ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>

      <label className="field-group">
        <span>模型</span>
        <input
          value={profile.model}
          onChange={(event) => onChange({ ...profile, model: event.target.value })}
          placeholder="输入模型名称"
          spellCheck={false}
        />
      </label>

      <label className="field-group">
        <span>AI 推理深度</span>
        <span className="input-with-action reasoning-effort-input">
          <BrainCircuit size={16} aria-hidden="true" />
          <input
            value={profile.reasoningEffort}
            onChange={(event) => onChange({ ...profile, reasoningEffort: event.target.value })}
            placeholder="留空使用模型默认值"
            list="reasoning-effort-options"
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            title="填写兼容服务支持的推理强度；留空时不发送该参数"
          />
        </span>
        <datalist id="reasoning-effort-options">
          {REASONING_EFFORT_OPTIONS.map((effort) => <option value={effort} key={effort} />)}
        </datalist>
      </label>

      <fieldset className="field-group">
        <legend>API 类型</legend>
        <div className="segmented-control api-segments">
          <button
            type="button"
            className={profile.apiStyle === 'responses' ? 'active' : ''}
            onClick={() => onChange({ ...profile, apiStyle: 'responses' })}
          >
            Responses API
          </button>
          <button
            type="button"
            className={profile.apiStyle === 'chat' ? 'active' : ''}
            onClick={() => onChange({ ...profile, apiStyle: 'chat' })}
          >
            Chat Completions
          </button>
        </div>
      </fieldset>
    </div>
  )
}

export function SettingsModal({ open, aiA, aiB, onClose, onSave }: SettingsModalProps) {
  const [active, setActive] = useState<'a' | 'b'>('a')
  const [draftA, setDraftA] = useState(aiA)
  const [draftB, setDraftB] = useState(aiB)
  const [revealA, setRevealA] = useState(false)
  const [revealB, setRevealB] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraftA(aiA)
    setDraftB(aiB)
    setRevealA(false)
    setRevealB(false)
  }, [open, aiA, aiB])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null

  const save = () => {
    onSave(draftA, draftB)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">MODEL CONNECTIONS</p>
            <h2 id="settings-title">AI 模型配置</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭">
            <X size={20} />
          </button>
        </header>

        <div className="profile-tabs" role="tablist" aria-label="AI 配置">
          <button type="button" role="tab" aria-selected={active === 'a'} className={active === 'a' ? 'active' : ''} onClick={() => setActive('a')}>
            <span className="profile-dot profile-a" />AI A
          </button>
          <button type="button" role="tab" aria-selected={active === 'b'} className={active === 'b' ? 'active' : ''} onClick={() => setActive('b')}>
            <span className="profile-dot profile-b" />AI B
          </button>
        </div>

        <div className="modal-body">
          {active === 'a'
            ? <ProfileForm profile={draftA} revealKey={revealA} onReveal={() => setRevealA((value) => !value)} onChange={setDraftA} />
            : <ProfileForm profile={draftB} revealKey={revealB} onReveal={() => setRevealB((value) => !value)} onChange={setDraftB} />}
          {active === 'b' && (
            <button type="button" className="copy-profile" onClick={() => setDraftB({ ...draftA, name: 'AI B' })}>
              <Copy size={15} />复制 AI A 配置
            </button>
          )}
        </div>

        <footer className="modal-footer">
          <span className="local-note"><KeyRound size={14} />密钥仅保存在本机浏览器</span>
          <div className="modal-actions">
            <button type="button" className="text-button" onClick={onClose}>取消</button>
            <button type="button" className="primary-button small" onClick={save}><Check size={17} />保存配置</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
