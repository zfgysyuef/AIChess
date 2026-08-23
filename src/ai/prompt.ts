import { GAME_META, serializeForAI, type GameMove, type GameState } from '../game'

interface RecentMove {
  ply: number
  actor: string
  controller: string
  notation: string
  moveId: string
  thinking?: string
}

interface PromptOptions {
  state: GameState
  legalMoves: GameMove[]
  recentMoves: RecentMove[]
  currentController: string
  correction?: string
}

const MAX_THINKING_HISTORY = 6
const MAX_THINKING_LENGTH = 1200

export const AI_SYSTEM_PROMPT = `你是一名严谨的棋类对弈引擎。你必须从用户提供的合法着法中选择一步，不能自行发明坐标。
用户可能提供你此前回合的思考轨迹；它们仅用于复盘和保持策略连续性。若旧轨迹与当前局面冲突，必须以当前局面和合法着法列表为准。
合法着法列表每行使用“ID | 棋谱记法”格式；move 字段只能复制竖线左侧的 ID，不能包含竖线、括号或右侧棋谱记法。
只输出一个 JSON 对象，不要使用 Markdown：{"move":"合法着法ID","reason":"不超过30个汉字的简短理由"}`

function compactThinking(thinking: string): string {
  const normalized = thinking.trim()
  return normalized.length > MAX_THINKING_LENGTH
    ? `${normalized.slice(0, MAX_THINKING_LENGTH)}\n[本次轨迹已截断]`
    : normalized
}

export function buildMovePrompt({ state, legalMoves, recentMoves, currentController, correction }: PromptOptions): string {
  const meta = GAME_META[state.kind]
  const side = state.turn === 'first' ? meta.first : meta.second
  const moveList = legalMoves.map((move) => move.notation === move.id ? move.id : `${move.id} | ${move.notation}`).join('\n')
  const history = recentMoves.length
    ? recentMoves.slice(-10).map((move, index) => `${index + 1}. ${move.actor}: ${move.moveId} (${move.notation})`).join('\n')
    : '尚无着法'
  const thinkingHistory = recentMoves
    .filter((move) => move.controller === currentController && move.thinking?.trim())
    .slice(-MAX_THINKING_HISTORY)
    .map((move) => `第 ${move.ply} 手，落子 ${move.moveId} (${move.notation})：\n${compactThinking(move.thinking!)}`)
    .join('\n\n') || '尚无可用思考轨迹'

  return [
    `棋类：${meta.name}`,
    `你执：${side}`,
    `规则：${meta.rule}`,
    '',
    '当前局面：',
    serializeForAI(state),
    '',
    '最近着法：',
    history,
    '',
    '你此前的思考轨迹（仅供复盘，当前局面与合法着法优先）：',
    thinkingHistory,
    '',
    `合法着法 ID（每行若含“|”，move 只能复制左侧 ID）：\n${moveList}`,
    correction ? `\n上一次返回无效：${correction}。请重新选择。` : '',
  ].filter(Boolean).join('\n')
}
