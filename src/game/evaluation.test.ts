import { describe, expect, it } from 'vitest'
import {
  applyGameMove,
  createGame,
  estimateWinRate,
  resignGame,
  type ChessState,
  type GameKind,
  type GomokuState,
  type XiangqiState,
} from '.'

describe('local win rate estimation', () => {
  it.each(['gomoku', 'xiangqi', 'go', 'chess'] as GameKind[])('starts %s near an even position', (kind) => {
    const estimate = estimateWinRate(createGame(kind))
    expect(estimate.first + estimate.second).toBe(100)
    expect(estimate.first).toBeGreaterThanOrEqual(45)
    expect(estimate.first).toBeLessThanOrEqual(55)
    expect(estimate.exact).toBe(false)
  })

  it('uses exact percentages for decisive and drawn results', () => {
    const resigned = resignGame(createGame('chess'), 'second')
    expect(estimateWinRate(resigned)).toEqual({ first: 100, second: 0, exact: true })

    const draw: ChessState = {
      ...(createGame('chess') as ChessState),
      result: { draw: true, label: '和棋' },
    }
    expect(estimateWinRate(draw)).toEqual({ first: 50, second: 50, exact: true })
  })

  it('recognizes a decisive material advantage in chess', () => {
    const state: ChessState = {
      kind: 'chess',
      fen: '4k3/8/8/8/8/8/4K3/Q7 w - - 0 1',
      turn: 'first',
    }
    expect(estimateWinRate(state).first).toBeGreaterThan(85)
  })

  it('recognizes a strong open-four threat in gomoku', () => {
    const state = createGame('gomoku') as GomokuState
    for (let col = 5; col <= 8; col += 1) state.board[7]![col] = 1
    state.turn = 'second'
    expect(estimateWinRate(state).first).toBeGreaterThan(90)
  })

  it('updates the displayed balance after a move', () => {
    const state = createGame('gomoku')
    const before = estimateWinRate(state)
    const after = estimateWinRate(applyGameMove(state, 'H8').state)
    expect(after.first).not.toBe(before.first)
    expect(after.first + after.second).toBe(100)
  })

  it('reacts when a major xiangqi piece is removed', () => {
    const state = createGame('xiangqi') as XiangqiState
    const weakened: XiangqiState = { ...state, fen: state.fen.replace('r', '1') }
    expect(estimateWinRate(weakened).first).toBeGreaterThan(70)
  })
})
