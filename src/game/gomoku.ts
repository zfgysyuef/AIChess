import { GomokuSolution } from '@algorithm.ts/gomoku'
import { coordToId } from './coordinates'
import type { GameMove, GomokuCell, GomokuState, Seat } from './types'

export const GOMOKU_SIZE = 15

export function createGomokuState(): GomokuState {
  return {
    kind: 'gomoku',
    board: Array.from({ length: GOMOKU_SIZE }, () => Array<GomokuCell>(GOMOKU_SIZE).fill(0)),
    turn: 'first',
  }
}

export function getGomokuMoves(state: GomokuState): GameMove[] {
  if (state.result) return []
  const moves: GameMove[] = []
  for (let row = 0; row < GOMOKU_SIZE; row += 1) {
    for (let col = 0; col < GOMOKU_SIZE; col += 1) {
      if (state.board[row]?.[col] === 0) {
        const id = coordToId({ row, col })
        moves.push({ id, notation: id, to: { row, col } })
      }
    }
  }
  return moves
}

function winnerAt(board: GomokuCell[][], row: number, col: number): GomokuCell {
  const value = board[row]?.[col] ?? 0
  if (!value) return 0
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const
  for (const [rowStep, colStep] of directions) {
    let count = 1
    for (const direction of [-1, 1]) {
      let nextRow = row + rowStep * direction
      let nextCol = col + colStep * direction
      while (board[nextRow]?.[nextCol] === value) {
        count += 1
        nextRow += rowStep * direction
        nextCol += colStep * direction
      }
    }
    if (count >= 5) return value
  }
  return 0
}

function engineConfirmsFinal(board: GomokuCell[][]): boolean {
  const solution = new GomokuSolution({
    MAX_ROW: GOMOKU_SIZE,
    MAX_COL: GOMOKU_SIZE,
    MAX_ADJACENT: 5,
    MAX_DISTANCE_OF_NEIGHBOR: 2,
  })
  const pieces = board.flatMap((row, r) =>
    row.flatMap((cell, c) => cell === 0 ? [] : [{ r, c, p: cell - 1 }]),
  )
  solution.init(pieces)
  return solution.mover.isFinal()
}

export function applyGomokuMove(state: GomokuState, move: GameMove): GomokuState {
  if (!move.to || state.result || state.board[move.to.row]?.[move.to.col] !== 0) {
    throw new Error('这一步不合法')
  }

  const board = state.board.map((row) => [...row])
  const stone: GomokuCell = state.turn === 'first' ? 1 : 2
  board[move.to.row]![move.to.col] = stone
  const winner = winnerAt(board, move.to.row, move.to.col)
  const boardFull = board.every((row) => row.every(Boolean))
  const final = winner !== 0 || boardFull

  if (final && !engineConfirmsFinal(board)) throw new Error('五子棋引擎未能确认终局')

  const winnerSeat: Seat | undefined = winner === 1 ? 'first' : winner === 2 ? 'second' : undefined
  return {
    ...state,
    board,
    turn: state.turn === 'first' ? 'second' : 'first',
    lastMove: move.to,
    result: final
      ? {
          winner: winnerSeat,
          draw: !winnerSeat,
          label: winnerSeat ? `${winnerSeat === 'first' ? '黑方' : '白方'}五连胜` : '棋盘已满，和棋',
        }
      : undefined,
  }
}
