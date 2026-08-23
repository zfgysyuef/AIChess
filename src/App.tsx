import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  CircleDot,
  Clock3,
  Crown,
  Flag,
  Grid3X3,
  ListOrdered,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  SkipForward,
  Swords,
  Undo2,
  UserRound,
  X,
} from 'lucide-react'
import { requestAIChoice } from './ai/client'
import { resolveAIChoice } from './ai/move'
import { buildMovePrompt, AI_SYSTEM_PROMPT } from './ai/prompt'
import { isAIConfigured, type AIConfig } from './ai/types'
import { GameBoard } from './components/GameBoard'
import { ResignModal } from './components/ResignModal'
import { SettingsModal } from './components/SettingsModal'
import { loadSettings, saveSettings, type AppSettings, type MatchMode } from './config'
import {
  applyGameMove,
  createGame,
  GAME_META,
  getLegalMoves,
  resignGame,
  sameCoord,
  type Coord,
  type GameKind,
  type GameState,
  type Seat,
} from './game'
import { isChessCheck } from './game/chess'
import { isXiangqiCheck } from './game/xiangqi'

type ControllerId = 'human' | 'aiA' | 'aiB'
type Phase = 'idle' | 'thinking' | 'error'
type RecordView = 'moves' | 'thinking'

interface Controller {
  id: ControllerId
  kind: 'human' | 'ai'
  label: string
  config?: AIConfig
}

interface MoveRecord {
  ply: number
  seat: Seat
  controller: ControllerId
  actor: string
  moveId: string
  notation: string
  reason?: string
  thinking?: string
  thinkingMs?: number
}

interface LiveThinking {
  ply: number
  seat: Seat
  actor: string
  text: string
}

interface MatchSnapshot {
  state: GameState
  records: MoveRecord[]
}

interface PromotionChoice {
  snapshot: MatchSnapshot
  actor: Controller
  moves: ReturnType<typeof getLegalMoves>
}

const GAME_ICONS = {
  gomoku: Grid3X3,
  xiangqi: Shield,
  go: CircleDot,
  chess: Crown,
} as const

function controllerFor(seat: Seat, settings: AppSettings): Controller {
  if (settings.mode === 'human-ai') {
    if (seat === settings.humanSeat) return { id: 'human', kind: 'human', label: '你' }
    return { id: 'aiA', kind: 'ai', label: 'AI A', config: settings.aiA }
  }
  return seat === 'first'
    ? { id: 'aiA', kind: 'ai', label: 'AI A', config: settings.aiA }
    : { id: 'aiB', kind: 'ai', label: 'AI B', config: settings.aiB }
}

function apiLabel(config: AIConfig): string {
  return config.apiStyle === 'responses' ? 'Responses' : 'Chat Completions'
}

function formatThinkingTime(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} 毫秒`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} 秒`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1000)
  return `${minutes} 分 ${seconds} 秒`
}

function PlayerBadge({ seat, settings, active }: { seat: Seat; settings: AppSettings; active: boolean }) {
  const meta = GAME_META[settings.game]
  const controller = controllerFor(seat, settings)
  const side = seat === 'first' ? meta.first : meta.second
  return (
    <div className={`player-badge ${active ? 'active' : ''}`}>
      <span className={`player-avatar ${controller.kind === 'human' ? 'human-avatar' : seat === 'first' ? 'ai-a-avatar' : 'ai-b-avatar'}`}>
        {controller.kind === 'human' ? <UserRound size={18} /> : <Bot size={18} />}
      </span>
      <span className="player-copy">
        <strong>{controller.label}</strong>
        <small>{side}</small>
      </span>
      {active && <span className="turn-pulse" aria-label="当前行棋" />}
    </div>
  )
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [timeline, setTimeline] = useState<MatchSnapshot[]>(() => [{
    state: createGame(settings.game, settings.goSize),
    records: [],
  }])
  const [selected, setSelected] = useState<Coord>()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiPaused, setAiPaused] = useState(settings.mode === 'ai-ai')
  const [promotion, setPromotion] = useState<PromotionChoice>()
  const [recordView, setRecordView] = useState<RecordView>('moves')
  const [liveThinking, setLiveThinking] = useState<LiveThinking>()
  const [resignOpen, setResignOpen] = useState(false)
  const [resigningSeat, setResigningSeat] = useState<Seat>(settings.humanSeat)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const resumeAIRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const current = timeline[timeline.length - 1]!
  const currentRef = useRef(current)

  useEffect(() => {
    currentRef.current = current
  }, [current])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [current.records.length, current.state.result?.label, liveThinking?.text, recordView])

  const legalMoves = useMemo(() => getLegalMoves(current.state), [current.state])
  const currentController = controllerFor(current.state.turn, settings)
  const meta = GAME_META[current.state.kind]
  const thinking = phase === 'thinking'
  const aiRecords = useMemo(
    () => current.records.filter((record) => record.controller !== 'human'),
    [current.records],
  )
  const boardDisabled = thinking || Boolean(current.state.result) || currentController.kind !== 'human'
  const inCheck = useMemo(() => {
    if (current.state.kind === 'chess') return isChessCheck(current.state)
    if (current.state.kind === 'xiangqi') return isXiangqiCheck(current.state)
    return false
  }, [current.state])

  const stopRequest = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = undefined
    setLiveThinking(undefined)
    setPhase('idle')
  }, [])

  const resetMatch = useCallback((game: GameKind, mode: MatchMode, goSize: 9 | 13 | 19) => {
    stopRequest()
    setTimeline([{ state: createGame(game, goSize), records: [] }])
    setSelected(undefined)
    setPromotion(undefined)
    setResignOpen(false)
    resumeAIRef.current = false
    setError('')
    setAiPaused(mode === 'ai-ai')
  }, [stopRequest])

  const updateGame = (game: GameKind) => {
    setSettings((previous) => ({ ...previous, game }))
    resetMatch(game, settings.mode, settings.goSize)
  }

  const updateMode = (mode: MatchMode) => {
    setSettings((previous) => ({ ...previous, mode }))
    resetMatch(settings.game, mode, settings.goSize)
  }

  const updateHumanSeat = (humanSeat: Seat) => {
    setSettings((previous) => ({ ...previous, humanSeat }))
    resetMatch(settings.game, settings.mode, settings.goSize)
  }

  const updateGoSize = (goSize: 9 | 13 | 19) => {
    setSettings((previous) => ({ ...previous, goSize }))
    resetMatch(settings.game, settings.mode, goSize)
  }

  const commitMove = useCallback((
    snapshot: MatchSnapshot,
    moveId: string,
    actor: Controller,
    reason = '',
    thinkingPath = '',
    thinkingMs?: number,
  ) => {
    const applied = applyGameMove(snapshot.state, moveId)
    const record: MoveRecord = {
      ply: snapshot.records.length + 1,
      seat: snapshot.state.turn,
      controller: actor.id,
      actor: actor.label,
      moveId: applied.move.id,
      notation: applied.move.notation,
      reason,
      thinking: actor.kind === 'ai' ? thinkingPath.trim() : undefined,
      thinkingMs: actor.kind === 'ai' ? thinkingMs : undefined,
    }
    setTimeline((previous) => {
      if (previous[previous.length - 1] !== snapshot) return previous
      return [...previous, { state: applied.state, records: [...snapshot.records, record] }]
    })
    setSelected(undefined)
    setPromotion(undefined)
    setLiveThinking(undefined)
    setError('')
    setPhase('idle')
  }, [])

  const handlePoint = (coord: Coord) => {
    if (boardDisabled) return
    const state = current.state
    if (state.kind === 'gomoku' || state.kind === 'go') {
      const move = legalMoves.find((candidate) => sameCoord(candidate.to, coord))
      if (move) commitMove(current, move.id, currentController)
      return
    }

    if (selected) {
      const candidates = legalMoves.filter((move) => sameCoord(move.from, selected) && sameCoord(move.to, coord))
      if (state.kind === 'chess' && candidates.length > 1) {
        setPromotion({ snapshot: current, actor: currentController, moves: candidates })
        return
      }
      const preferred = candidates.find((move) => move.id.toLowerCase().endsWith('q')) ?? candidates[0]
      if (preferred) {
        commitMove(current, preferred.id, currentController)
        return
      }
    }

    const outgoing = legalMoves.some((move) => sameCoord(move.from, coord))
    setSelected(outgoing && !sameCoord(selected, coord) ? coord : undefined)
  }

  const passGo = () => {
    const pass = legalMoves.find((move) => move.isPass)
    if (pass && !boardDisabled) commitMove(current, pass.id, currentController)
  }

  const runAITurn = useCallback(async (snapshot: MatchSnapshot) => {
    const actor = controllerFor(snapshot.state.turn, settings)
    if (actor.kind !== 'ai' || !actor.config) return
    if (!isAIConfigured(actor.config)) {
      setError(`${actor.label} 尚未填写 Base URL 和模型`)
      setPhase('error')
      setAiPaused(true)
      setSettingsOpen(true)
      return
    }

    const legal = getLegalMoves(snapshot.state)
    if (!legal.length) return
    const controller = new AbortController()
    const startedAt = performance.now()
    abortRef.current = controller
    setLiveThinking({
      ply: snapshot.records.length + 1,
      seat: snapshot.state.turn,
      actor: actor.label,
      text: '',
    })
    setPhase('thinking')
    setError('')

    try {
      let correction = ''
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
          setLiveThinking((previous) => previous ? { ...previous, text: '' } : previous)
        }
        const prompt = buildMovePrompt({
          state: snapshot.state,
          legalMoves: legal,
          recentMoves: snapshot.records,
          currentController: actor.id,
          correction,
        })
        const choice = await requestAIChoice(
          actor.config,
          AI_SYSTEM_PROMPT,
          prompt,
          controller.signal,
          (thinkingPath) => {
            if (controller.signal.aborted || abortRef.current !== controller || currentRef.current !== snapshot) return
            setLiveThinking((previous) => previous ? { ...previous, text: thinkingPath } : previous)
          },
        )
        const match = resolveAIChoice(choice.move, legal)
        if (match) {
          if (currentRef.current !== snapshot || controller.signal.aborted) return
          commitMove(snapshot, match.id, actor, choice.reason, choice.thinking, performance.now() - startedAt)
          return
        }
        correction = `“${choice.move}”不在合法着法列表中`
      }
      throw new Error('模型连续两次返回非法着法')
    } catch (requestError) {
      if (controller.signal.aborted) return
      setLiveThinking(undefined)
      setError(requestError instanceof Error ? requestError.message : 'AI 请求失败')
      setPhase('error')
      if (settings.mode === 'ai-ai') setAiPaused(true)
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined
    }
  }, [commitMove, settings])

  useEffect(() => {
    if (settingsOpen || resignOpen || phase !== 'idle' || current.state.result) return
    const actor = controllerFor(current.state.turn, settings)
    if (actor.kind !== 'ai' || (settings.mode === 'ai-ai' && aiPaused)) return
    const delay = settings.mode === 'ai-ai' ? settings.aiDelay : 420
    const timer = window.setTimeout(() => void runAITurn(current), delay)
    return () => window.clearTimeout(timer)
  }, [aiPaused, current, phase, resignOpen, runAITurn, settings, settingsOpen])

  const undo = () => {
    if (timeline.length <= 1) return
    stopRequest()
    setTimeline((previous) => {
      const latest = previous[previous.length - 1]!
      const preceding = previous[previous.length - 2]
      const records = latest.records
      const terminationOnly = Boolean(
        preceding
        && latest.state.result
        && !preceding.state.result
        && latest.records.length === preceding.records.length,
      )
      const last = records[records.length - 1]
      let removeCount = 1
      if (!terminationOnly && settings.mode === 'human-ai' && last?.controller !== 'human' && records[records.length - 2]?.controller === 'human') {
        removeCount = 2
      }
      return previous.slice(0, Math.max(1, previous.length - removeCount))
    })
    setSelected(undefined)
    setPromotion(undefined)
    setError('')
    setAiPaused(settings.mode === 'ai-ai')
  }

  const precedingSnapshot = timeline[timeline.length - 2]
  const canUndoTermination = Boolean(
    precedingSnapshot
    && current.state.result
    && !precedingSnapshot.state.result
    && current.records.length === precedingSnapshot.records.length,
  )
  const canUndo = timeline.length > 1 && (
    canUndoTermination
    || settings.mode === 'ai-ai'
    || current.records.some((record) => record.controller === 'human')
  )

  const toggleAIPlay = () => {
    if (!aiPaused) {
      setAiPaused(true)
      stopRequest()
      return
    }
    const missing = [settings.aiA, settings.aiB].find((config) => !isAIConfigured(config))
    if (missing) {
      setError(`${missing.name} 尚未填写 Base URL 和模型`)
      setSettingsOpen(true)
      return
    }
    setError('')
    setPhase('idle')
    setAiPaused(false)
  }

  const retry = () => {
    setError('')
    setPhase('idle')
    if (settings.mode === 'ai-ai') setAiPaused(false)
  }

  const openModelSettings = () => {
    if (thinking) stopRequest()
    if (settings.mode === 'ai-ai') setAiPaused(true)
    setSettingsOpen(true)
  }

  const saveModelSettings = (aiA: AIConfig, aiB: AIConfig) => {
    setSettings((previous) => ({ ...previous, aiA, aiB }))
    setError('')
    setPhase('idle')
  }

  const openResign = () => {
    if (current.state.result) return
    resumeAIRef.current = settings.mode === 'ai-ai' && !aiPaused
    setResigningSeat(settings.mode === 'human-ai' ? settings.humanSeat : current.state.turn)
    stopRequest()
    if (settings.mode === 'ai-ai') setAiPaused(true)
    setResignOpen(true)
  }

  const closeResign = () => {
    setResignOpen(false)
    const shouldResume = resumeAIRef.current && !currentRef.current.state.result
    resumeAIRef.current = false
    if (shouldResume) setAiPaused(false)
  }

  const confirmResign = () => {
    resumeAIRef.current = false
    setResignOpen(false)
    stopRequest()
    setTimeline((previous) => {
      const latest = previous[previous.length - 1]!
      if (latest.state.result) return previous
      return [...previous, {
        state: resignGame(latest.state, resigningSeat),
        records: latest.records,
      }]
    })
    setSelected(undefined)
    setPromotion(undefined)
    setLiveThinking(undefined)
    setRecordView('moves')
    setError('')
    setAiPaused(true)
  }

  const turnSide = current.state.turn === 'first' ? meta.first : meta.second

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="棋境 AI 棋室">
          <span className="brand-mark"><Swords size={21} /></span>
          <span><strong>棋境</strong><small>AI BOARD ARENA</small></span>
        </div>

        <nav className="game-tabs" aria-label="选择棋类">
          {(Object.keys(GAME_META) as GameKind[]).map((kind) => {
            const Icon = GAME_ICONS[kind]
            return (
              <button type="button" key={kind} className={settings.game === kind ? 'active' : ''} onClick={() => updateGame(kind)}>
                <Icon size={17} />{GAME_META[kind].shortName}
              </button>
            )
          })}
        </nav>

        <button type="button" className="settings-trigger" onClick={openModelSettings}>
          <Settings2 size={18} /><span>模型设置</span>
        </button>
      </header>

      <main className="workspace">
        <aside className="control-rail">
          <section className="rail-section">
            <p className="section-label">对局模式</p>
            <div className="segmented-control mode-control">
              <button type="button" className={settings.mode === 'human-ai' ? 'active' : ''} onClick={() => updateMode('human-ai')}>
                <UserRound size={15} />人机
              </button>
              <button type="button" className={settings.mode === 'ai-ai' ? 'active' : ''} onClick={() => updateMode('ai-ai')}>
                <Bot size={15} />AI 对弈
              </button>
            </div>
          </section>

          {settings.mode === 'human-ai' && (
            <section className="rail-section">
              <p className="section-label">你的执方</p>
              <div className="segmented-control side-control">
                <button type="button" className={settings.humanSeat === 'first' ? 'active' : ''} onClick={() => updateHumanSeat('first')}>{meta.first}</button>
                <button type="button" className={settings.humanSeat === 'second' ? 'active' : ''} onClick={() => updateHumanSeat('second')}>{meta.second}</button>
              </div>
            </section>
          )}

          {settings.game === 'go' && (
            <section className="rail-section">
              <p className="section-label">棋盘路数</p>
              <div className="segmented-control size-control">
                {([9, 13, 19] as const).map((size) => (
                  <button type="button" key={size} className={settings.goSize === size ? 'active' : ''} onClick={() => updateGoSize(size)}>{size} 路</button>
                ))}
              </div>
            </section>
          )}

          <section className="rail-section connection-section">
            <div className="section-heading-row">
              <p className="section-label">模型席位</p>
              <button type="button" className="inline-action" onClick={openModelSettings}><Settings2 size={14} />配置</button>
            </div>
            <button type="button" className="connection-row" onClick={openModelSettings}>
              <span className="profile-dot profile-a" />
              <span><strong>AI A</strong><small>{settings.aiA.model || '未设置模型'}</small></span>
              <em>{apiLabel(settings.aiA)}</em>
            </button>
            {settings.mode === 'ai-ai' && (
              <button type="button" className="connection-row" onClick={openModelSettings}>
                <span className="profile-dot profile-b" />
                <span><strong>AI B</strong><small>{settings.aiB.model || '未设置模型'}</small></span>
                <em>{apiLabel(settings.aiB)}</em>
              </button>
            )}
          </section>

          <section className="rail-section rule-section">
            <p className="section-label">本局规则</p>
            <p>{meta.rule}</p>
          </section>

          <div className="rail-spacer" />

          {current.state.result ? (
            <button type="button" className="primary-button match-control" onClick={() => resetMatch(settings.game, settings.mode, settings.goSize)}>
              <RotateCcw size={18} />再来一局
            </button>
          ) : settings.mode === 'ai-ai' ? (
            <button type="button" className={`primary-button match-control ${!aiPaused ? 'is-running' : ''}`} onClick={toggleAIPlay} disabled={Boolean(current.state.result)}>
              {!aiPaused ? <><Pause size={18} />暂停对弈</> : <><Play size={18} />开始对弈</>}
            </button>
          ) : phase === 'error' ? (
            <button type="button" className="primary-button match-control" onClick={retry}>
              <Play size={18} />重试当前回合
            </button>
          ) : (
            <div className={`turn-status ${thinking ? 'thinking' : ''}`}>
              {thinking ? <LoaderCircle size={18} className="spin" /> : <CircleDot size={18} />}
              <span><strong>{thinking ? 'AI 正在思考' : currentController.kind === 'human' ? '轮到你落子' : '等待 AI'}</strong><small>{turnSide}</small></span>
            </div>
          )}
        </aside>

        <section className="board-stage">
          <header className="match-header">
            <div className="players-row">
              <PlayerBadge seat="first" settings={settings} active={!current.state.result && current.state.turn === 'first'} />
              <span className="versus">VS</span>
              <PlayerBadge seat="second" settings={settings} active={!current.state.result && current.state.turn === 'second'} />
            </div>
            <div className="match-tools">
              <button type="button" className="icon-button" onClick={undo} disabled={!canUndo} title="悔棋"><Undo2 size={18} /></button>
              {!current.state.result && <button type="button" className="icon-button resign-trigger" onClick={openResign} title="认输" aria-label="认输"><Flag size={18} /></button>}
              <button type="button" className="icon-button" onClick={() => resetMatch(settings.game, settings.mode, settings.goSize)} title="重新开始"><RotateCcw size={18} /></button>
            </div>
          </header>

          <div className={`board-status-bar ${current.state.result ? 'finished' : ''}`}>
            <span className="status-indicator" />
            <strong>{current.state.result?.label ?? `${turnSide}行棋`}</strong>
            {inCheck && !current.state.result && <em>将军</em>}
            {thinking && <small><LoaderCircle size={13} className="spin" />{currentController.label} 分析局面</small>}
          </div>

          <div className={`board-frame frame-${current.state.kind}`}>
            <GameBoard state={current.state} legalMoves={legalMoves} selected={selected} disabled={boardDisabled} onPoint={handlePoint} />
            {promotion && (
              <div className="promotion-picker" role="dialog" aria-label="选择升变棋子">
                <strong>选择升变棋子</strong>
                <div>
                  {promotion.moves.map((move) => {
                    const role = move.id.at(-1)?.toLowerCase() ?? 'q'
                    const symbols: Record<string, string> = promotion.snapshot.state.turn === 'first'
                      ? { q: '♕', r: '♖', b: '♗', n: '♘' }
                      : { q: '♛', r: '♜', b: '♝', n: '♞' }
                    const labels: Record<string, string> = { q: '后', r: '车', b: '象', n: '马' }
                    return (
                      <button type="button" key={move.id} onClick={() => commitMove(promotion.snapshot, move.id, promotion.actor)} title={`升变为${labels[role]}`} aria-label={`升变为${labels[role]}`}>
                        {symbols[role]}
                      </button>
                    )
                  })}
                  <button type="button" className="cancel-promotion" onClick={() => setPromotion(undefined)} title="取消升变"><X size={19} /></button>
                </div>
              </div>
            )}
          </div>

          <footer className="board-footer">
            <span>{current.records.length} 手</span>
            {current.state.kind === 'go' && (
              <>
                <span>黑提 {current.state.captures.first}</span>
                <span>白提 {current.state.captures.second}</span>
                {currentController.kind === 'human' && !current.state.result && (
                  <button type="button" className="pass-button" onClick={passGo} disabled={boardDisabled}><SkipForward size={15} />停一手</button>
                )}
              </>
            )}
            <span className="engine-note">本地规则校验</span>
          </footer>

          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} /><span>{error}</span>
              <button type="button" onClick={openModelSettings}>检查配置</button>
            </div>
          )}
        </section>

        <aside className="record-rail">
          <header className="record-header">
            <div>
              <p className="section-label">{recordView === 'moves' ? 'LIVE RECORD' : 'MODEL REASONING'}</p>
              <h2>{recordView === 'moves' ? '对局棋谱' : 'AI 思考路径'}</h2>
            </div>
            <span>{recordView === 'moves' ? current.records.length : aiRecords.length + (liveThinking ? 1 : 0)}</span>
          </header>
          <div className="record-view-tabs" role="tablist" aria-label="右侧记录视图">
            <button
              type="button"
              role="tab"
              aria-selected={recordView === 'moves'}
              aria-controls="move-record-panel"
              className={recordView === 'moves' ? 'active' : ''}
              onClick={() => setRecordView('moves')}
            >
              <ListOrdered size={14} />棋谱
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={recordView === 'thinking'}
              aria-controls="thinking-record-panel"
              className={recordView === 'thinking' ? 'active' : ''}
              onClick={() => setRecordView('thinking')}
            >
              <BrainCircuit size={14} />AI 思考
            </button>
          </div>
          {recordView === 'moves' ? (
            <div className="move-list" id="move-record-panel" role="tabpanel">
              {!current.records.length && !current.state.result && <div className="empty-record"><Swords size={24} /><span>等待第一手</span></div>}
              {current.records.map((record) => (
                <article className="move-entry" key={record.ply}>
                  <span className="move-number">{record.ply}</span>
                  <span className={`move-side side-${record.seat}`} />
                  <div className="move-copy">
                    <div>
                      <strong>{record.notation}</strong>
                      <code>{record.moveId}</code>
                      <small>{record.actor}{record.thinkingMs !== undefined ? ` · ${formatThinkingTime(record.thinkingMs)}` : ''}</small>
                    </div>
                    {record.reason && <p>{record.reason}</p>}
                  </div>
                </article>
              ))}
              {current.state.result && (
                <article className="result-entry" aria-label="对局结果">
                  <Flag size={16} />
                  <span><strong>本局结束</strong><small>{current.state.result.label}</small></span>
                </article>
              )}
              <div ref={logEndRef} />
            </div>
          ) : (
            <div className="move-list thinking-list" id="thinking-record-panel" role="tabpanel">
              {!aiRecords.length && !liveThinking && <div className="empty-record"><BrainCircuit size={24} /><span>等待 AI 思考</span></div>}
              {aiRecords.map((record) => (
                <article className="thinking-entry" key={record.ply}>
                  <header>
                    <span className="move-number">{record.ply}</span>
                    <span className={`move-side side-${record.seat}`} />
                    <strong>{record.actor}</strong>
                    <code>{record.moveId}</code>
                    <small>{record.notation}</small>
                  </header>
                  {record.thinkingMs !== undefined && (
                    <div className="thinking-duration"><Clock3 size={11} /><span>思考用时</span><strong>{formatThinkingTime(record.thinkingMs)}</strong></div>
                  )}
                  <p className={record.thinking ? 'thinking-text' : 'thinking-text unavailable'}>
                    {record.thinking || '该模型未提供思考路径'}
                  </p>
                  {record.reason && <p className="thinking-reason"><span>最终理由</span>{record.reason}</p>}
                </article>
              ))}
              {liveThinking && (
                <article className="thinking-entry live-thinking-entry">
                  <header>
                    <span className="move-number">{liveThinking.ply}</span>
                    <span className={`move-side side-${liveThinking.seat}`} />
                    <strong>{liveThinking.actor}</strong>
                    <code>实时</code>
                    <small><LoaderCircle size={11} className="spin" />思考中</small>
                  </header>
                  <p className={`thinking-text live-thinking-text ${liveThinking.text ? '' : 'unavailable'}`} aria-live="polite">
                    {liveThinking.text || '正在等待模型返回推理内容...'}
                  </p>
                </article>
              )}
              <div ref={logEndRef} />
            </div>
          )}
          <footer className="record-footer">
            <span className={`connection-light ${isAIConfigured(settings.aiA) ? 'online' : ''}`} />
            <span>AI A · {apiLabel(settings.aiA)}</span>
          </footer>
        </aside>
      </main>

      <ResignModal
        open={resignOpen}
        game={settings.game}
        mode={settings.mode}
        humanSeat={settings.humanSeat}
        resigningSeat={resigningSeat}
        onSelectSeat={setResigningSeat}
        onClose={closeResign}
        onConfirm={confirmResign}
      />
      <SettingsModal
        open={settingsOpen}
        aiA={settings.aiA}
        aiB={settings.aiB}
        onClose={() => setSettingsOpen(false)}
        onSave={saveModelSettings}
      />
    </div>
  )
}
