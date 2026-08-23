import GoBoard, { type Sign, type SignMap } from '@sabaki/go-board'
import { cloneGrid, coordToId } from './coordinates'
import type { GameMove, GoScore, GoSign, GoState, Seat } from './types'

function signForSeat(seat: Seat): Sign {
  return seat === 'first' ? 1 : -1
}

function boardsEqual(left?: GoSign[][], right?: SignMap): boolean {
  return Boolean(left && right && left.length === right.length && left.every((row, r) =>
    row.length === right[r]?.length && row.every((cell, c) => cell === right[r]?.[c]),
  ))
}

function countSign(board: GoSign[][] | SignMap, sign: Sign): number {
  return board.reduce((sum, row) => sum + row.filter((cell) => cell === sign).length, 0)
}

export function createGoState(size: 9 | 13 | 19 = 19): GoState {
  return {
    kind: 'go',
    size,
    board: Array.from({ length: size }, () => Array<GoSign>(size).fill(0)),
    turn: 'first',
    passCount: 0,
    captures: { first: 0, second: 0 },
    komi: 6.5,
  }
}

function isLegalVertex(state: GoState, row: number, col: number): boolean {
  if (state.board[row]?.[col] !== 0) return false
  const board = new GoBoard(cloneGrid(state.board))
  const sign = signForSeat(state.turn)
  const analysis = board.analyzeMove(sign, [col, row])
  if (analysis.overwrite || analysis.suicide) return false
  const next = board.makeMove(sign, [col, row], { preventOverwrite: true, preventSuicide: true })
  return !boardsEqual(state.previousBoard, next.signMap)
}

export function getGoMoves(state: GoState): GameMove[] {
  if (state.result) return []
  const moves: GameMove[] = []
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      if (isLegalVertex(state, row, col)) {
        const id = coordToId({ row, col })
        moves.push({ id, notation: id, to: { row, col } })
      }
    }
  }
  moves.push({ id: 'PASS', notation: '停一手', isPass: true })
  return moves
}

function areaScore(board: GoSign[][], komi: number): GoScore {
  const size = board.length
  let black = countSign(board, 1)
  let white = countSign(board, -1) + komi
  const seen = new Set<string>()

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const key = `${row}:${col}`
      if (board[row]?.[col] !== 0 || seen.has(key)) continue
      const region: Array<[number, number]> = []
      const borders = new Set<GoSign>()
      const queue: Array<[number, number]> = [[row, col]]
      seen.add(key)

      while (queue.length) {
        const [currentRow, currentCol] = queue.pop()!
        region.push([currentRow, currentCol])
        for (const [rowStep, colStep] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nextRow = currentRow + rowStep
          const nextCol = currentCol + colStep
          const value = board[nextRow]?.[nextCol]
          if (value === 0) {
            const nextKey = `${nextRow}:${nextCol}`
            if (!seen.has(nextKey)) {
              seen.add(nextKey)
              queue.push([nextRow, nextCol])
            }
          } else if (value === 1 || value === -1) {
            borders.add(value)
          }
        }
      }

      if (borders.size === 1) {
        if (borders.has(1)) black += region.length
        else white += region.length
      }
    }
  }
  return { black, white }
}

export function applyGoMove(state: GoState, move: GameMove): GoState {
  if (state.result) throw new Error('棋局已经结束')
  const nextTurn: Seat = state.turn === 'first' ? 'second' : 'first'

  if (move.isPass) {
    const passCount = state.passCount + 1
    if (passCount < 2) {
      return {
        ...state,
        turn: nextTurn,
        passCount,
        previousBoard: undefined,
        lastMove: undefined,
        lastMoveWasPass: true,
      }
    }
    const score = areaScore(state.board, state.komi)
    const winner: Seat = score.black > score.white ? 'first' : 'second'
    return {
      ...state,
      turn: nextTurn,
      passCount,
      previousBoard: undefined,
      score,
      lastMove: undefined,
      lastMoveWasPass: true,
      result: {
        winner,
        draw: false,
        label: `${winner === 'first' ? '黑方' : '白方'}胜 ${Math.abs(score.black - score.white).toFixed(1)} 目`,
      },
    }
  }

  if (!move.to || !isLegalVertex(state, move.to.row, move.to.col)) throw new Error('这一步不符合围棋规则')
  const sign = signForSeat(state.turn)
  const board = new GoBoard(cloneGrid(state.board))
  const opponentBefore = countSign(state.board, (sign * -1) as Sign)
  const next = board.makeMove(sign, [move.to.col, move.to.row], {
    preventOverwrite: true,
    preventSuicide: true,
  })
  const nextBoard = next.signMap as GoSign[][]
  const captured = opponentBefore - countSign(nextBoard, (sign * -1) as Sign)
  const captures = { ...state.captures }
  captures[state.turn] += captured

  return {
    ...state,
    board: cloneGrid(nextBoard),
    previousBoard: cloneGrid(state.board),
    turn: nextTurn,
    passCount: 0,
    captures,
    lastMove: move.to,
    lastMoveWasPass: false,
  }
}
