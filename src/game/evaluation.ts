import { isChessCheck, readChessBoard } from './chess'
import type { ChessState, GameState, GoState, GomokuState, XiangqiState } from './types'
import { isXiangqiCheck, readXiangqiBoard } from './xiangqi'

export interface WinRateEstimate {
  first: number
  second: number
  exact: boolean
}

const CHESS_VALUES = { p: 1, n: 3.2, b: 3.3, r: 5, q: 9, k: 0 } as const
const XIANGQI_VALUES = {
  pawn: 1,
  cannon: 4.5,
  chariot: 9,
  horse: 4,
  elephant: 2,
  advisor: 2,
  king: 0,
} as const

function boundedEstimate(score: number, scale: number): WinRateEstimate {
  const probability = 100 / (1 + Math.exp(-score / scale))
  const first = Math.round(Math.min(97, Math.max(3, probability)))
  return { first, second: 100 - first, exact: false }
}

function terminalEstimate(state: GameState): WinRateEstimate | undefined {
  if (!state.result) return undefined
  if (state.result.draw || !state.result.winner) return { first: 50, second: 50, exact: true }
  return state.result.winner === 'first'
    ? { first: 100, second: 0, exact: true }
    : { first: 0, second: 100, exact: true }
}

function chessScore(state: ChessState): number {
  const board = readChessBoard(state)
  let score = 0.18
  let whiteBishops = 0
  let blackBishops = 0

  board.forEach((row, rowIndex) => row.forEach((piece, colIndex) => {
    if (!piece) return
    const sign = piece.color === 'w' ? 1 : -1
    score += sign * CHESS_VALUES[piece.type]

    const center = 3.5 - (Math.abs(rowIndex - 3.5) + Math.abs(colIndex - 3.5)) / 2
    if (piece.type === 'n' || piece.type === 'b') score += sign * center * 0.035
    if (piece.type === 'p') {
      const advancement = piece.color === 'w' ? 6 - rowIndex : rowIndex - 1
      score += sign * Math.max(0, advancement) * 0.045
    }
    if (piece.type === 'b') {
      if (piece.color === 'w') whiteBishops += 1
      else blackBishops += 1
    }
  }))

  if (whiteBishops >= 2) score += 0.16
  if (blackBishops >= 2) score -= 0.16
  score += state.turn === 'first' ? 0.12 : -0.12
  if (isChessCheck(state)) score += state.turn === 'first' ? -0.45 : 0.45
  return score
}

function xiangqiScore(state: XiangqiState): number {
  const board = readXiangqiBoard(state)
  let score = 0.08

  board.forEach((row, rowIndex) => row.forEach((piece, colIndex) => {
    if (!piece) return
    const sign = piece.color === 'red' ? 1 : -1
    score += sign * XIANGQI_VALUES[piece.role]

    const centerFile = 4 - Math.abs(colIndex - 4)
    if (piece.role === 'horse' || piece.role === 'cannon') score += sign * centerFile * 0.025
    if (piece.role === 'pawn') {
      const advancement = piece.color === 'red' ? 6 - rowIndex : rowIndex - 3
      const riverBonus = piece.color === 'red' ? rowIndex <= 4 : rowIndex >= 5
      score += sign * (Math.max(0, advancement) * 0.08 + (riverBonus ? 0.25 : 0))
    }
  }))

  score += state.turn === 'first' ? 0.12 : -0.12
  if (isXiangqiCheck(state)) score += state.turn === 'first' ? -0.5 : 0.5
  return score
}

function gomokuScore(state: GomokuState): number {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const
  const runValues = [0, 0.4, 2.5, 15, 90, 500]
  const size = state.board.length
  const center = (size - 1) / 2
  let score = state.turn === 'first' ? 0.8 : -0.8

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = state.board[row]?.[col] ?? 0
      if (!cell) continue
      const sign = cell === 1 ? 1 : -1
      const centerDistance = Math.abs(row - center) + Math.abs(col - center)
      score += sign * Math.max(0, center - centerDistance / 2) * 0.055

      for (const [rowStep, colStep] of directions) {
        // Start only at the head of a run so the same threat is not counted per stone.
        if (state.board[row - rowStep]?.[col - colStep] === cell) continue
        let length = 1
        while (state.board[row + rowStep * length]?.[col + colStep * length] === cell) length += 1

        const before = state.board[row - rowStep]?.[col - colStep] === 0
        const after = state.board[row + rowStep * length]?.[col + colStep * length] === 0
        const openEnds = Number(before) + Number(after)
        if (!openEnds) continue
        const openness = openEnds === 2 ? 1.6 : 0.65
        score += sign * (runValues[Math.min(length, 5)] ?? 0) * openness
      }
    }
  }
  return score
}

function nearestDistance(row: number, col: number, stones: Array<[number, number]>): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const [stoneRow, stoneCol] of stones) {
    nearest = Math.min(nearest, Math.abs(row - stoneRow) + Math.abs(col - stoneCol))
  }
  return nearest
}

function goScore(state: GoState): number {
  const black: Array<[number, number]> = []
  const white: Array<[number, number]> = []
  state.board.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    if (cell === 1) black.push([rowIndex, colIndex])
    if (cell === -1) white.push([rowIndex, colIndex])
  }))

  const area = state.size * state.size
  const stones = black.length + white.length
  // Komi and broad influence become more predictive as the board develops.
  const phase = Math.min(1, stones / (area * 0.35))
  let influence = 0

  if (black.length && white.length) {
    state.board.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
      if (cell !== 0) return
      const blackDistance = nearestDistance(rowIndex, colIndex, black)
      const whiteDistance = nearestDistance(rowIndex, colIndex, white)
      const distanceEdge = whiteDistance - blackDistance
      influence += Math.max(-0.3, Math.min(0.3, distanceEdge * 0.06))
    }))
  }

  return black.length
    - white.length
    + (state.captures.first - state.captures.second) * 0.7
    - state.komi * phase
    + influence * (0.35 + phase * 0.65)
    + (state.turn === 'first' ? 0.15 : -0.15)
}

export function estimateWinRate(state: GameState): WinRateEstimate {
  const terminal = terminalEstimate(state)
  if (terminal) return terminal

  switch (state.kind) {
    case 'gomoku': return boundedEstimate(gomokuScore(state), 18)
    case 'xiangqi': return boundedEstimate(xiangqiScore(state), 4.5)
    case 'go': return boundedEstimate(goScore(state), Math.max(4, state.size * 0.45))
    case 'chess': return boundedEstimate(chessScore(state), 3.5)
  }
}
