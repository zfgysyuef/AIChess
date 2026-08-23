import { applyChessMove, createChessState, getChessMoves } from './chess'
import { BOARD_FILES } from './coordinates'
import { applyGoMove, createGoState, getGoMoves } from './go'
import { applyGomokuMove, createGomokuState, getGomokuMoves } from './gomoku'
import type { AppliedMove, GameKind, GameMeta, GameMove, GameState, GoSign } from './types'
import { applyXiangqiMove, createXiangqiState, getXiangqiMoves } from './xiangqi'

export * from './types'
export * from './coordinates'

export const GAME_META: Record<GameKind, GameMeta> = {
  gomoku: {
    kind: 'gomoku',
    name: '五子棋',
    shortName: '五子棋',
    first: '黑方',
    second: '白方',
    rule: '15×15 自由规则，横、竖或斜线连续五子及以上获胜。',
  },
  xiangqi: {
    kind: 'xiangqi',
    name: '中国象棋',
    shortName: '象棋',
    first: '红方',
    second: '黑方',
    rule: '标准中国象棋规则，包含将军、将死、困毙与将帅照面判定。',
  },
  go: {
    kind: 'go',
    name: '围棋',
    shortName: '围棋',
    first: '黑方',
    second: '白方',
    rule: '默认 19×19 标准棋盘，禁自杀与简单劫；双方连续停一手后按面积计分，白贴 6.5 目。',
  },
  chess: {
    kind: 'chess',
    name: '国际象棋',
    shortName: '国际象棋',
    first: '白方',
    second: '黑方',
    rule: '标准国际象棋规则，包含王车易位、吃过路兵、升变与和棋判定。',
  },
}

export function createGame(kind: GameKind, goSize: 9 | 13 | 19 = 19): GameState {
  switch (kind) {
    case 'gomoku': return createGomokuState()
    case 'go': return createGoState(goSize)
    case 'chess': return createChessState()
    case 'xiangqi': return createXiangqiState()
  }
}

export function getLegalMoves(state: GameState): GameMove[] {
  switch (state.kind) {
    case 'gomoku': return getGomokuMoves(state)
    case 'go': return getGoMoves(state)
    case 'chess': return getChessMoves(state)
    case 'xiangqi': return getXiangqiMoves(state)
  }
}

export function applyGameMove(state: GameState, moveId: string): AppliedMove {
  const normalized = moveId.trim().toUpperCase()
  const legalMoves = getLegalMoves(state)
  const move = legalMoves.find((candidate) => candidate.id.toUpperCase() === normalized)
  if (!move) throw new Error(`非法着法：${moveId}`)

  switch (state.kind) {
    case 'gomoku': return { state: applyGomokuMove(state, move), move }
    case 'go': return { state: applyGoMove(state, move), move }
    case 'chess': return { state: applyChessMove(state, move), move }
    case 'xiangqi': return { state: applyXiangqiMove(state, move), move }
  }
}

function serializeGrid(board: Array<Array<0 | 1 | 2 | GoSign>>, size: number, go = false): string {
  const symbols = go
    ? new Map<number, string>([[0, '.'], [1, 'X'], [-1, 'O']])
    : new Map<number, string>([[0, '.'], [1, 'X'], [2, 'O']])
  const header = `    ${BOARD_FILES.slice(0, size).split('').join(' ')}`
  const rows = board.map((row, index) => `${String(index + 1).padStart(2, ' ')}  ${row.map((cell) => symbols.get(cell) ?? '?').join(' ')}`)
  return [header, ...rows].join('\n')
}

export function serializeForAI(state: GameState): string {
  switch (state.kind) {
    case 'gomoku':
      return `X=黑方，O=白方，左上角为 A1。\n${serializeGrid(state.board, 15)}`
    case 'go':
      return `X=黑方，O=白方，左上角为 A1。提子：黑 ${state.captures.first}，白 ${state.captures.second}。\n${serializeGrid(state.board, state.size, true)}`
    case 'chess':
      return `FEN: ${state.fen}`
    case 'xiangqi':
      return `FEN: ${state.fen}`
  }
}
