import { describe, expect, it } from 'vitest'
import { applyGameMove, createGame, getLegalMoves, resignGame, type GameKind, type GameState, type GoState } from '.'

describe('unified game engines', () => {
  it('detects a five-in-a-row win', () => {
    let state: GameState = createGame('gomoku')
    for (const move of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1']) {
      state = applyGameMove(state, move).state
    }
    expect(state.result).toMatchObject({ winner: 'first', draw: false })
    expect(getLegalMoves(state)).toHaveLength(0)
  })

  it('uses chess.js for legal chess moves', () => {
    const state = createGame('chess')
    const legal = getLegalMoves(state).map((move) => move.id)
    expect(legal).toContain('e2e4')
    expect(() => applyGameMove(state, 'e2e5')).toThrow(/非法着法/)
    const next = applyGameMove(state, 'e2e4').state
    expect(next.turn).toBe('second')
  })

  it('generates legal xiangqi moves through elephantops', () => {
    const state = createGame('xiangqi')
    const legal = getLegalMoves(state).map((move) => move.id)
    expect(legal).toContain('a1a2')
    expect(applyGameMove(state, 'a1a2').state.turn).toBe('second')
  })

  it('creates a standard 19x19 Go board by default', () => {
    const state = createGame('go') as GoState
    expect(state.size).toBe(19)
    expect(state.board).toHaveLength(19)
    expect(state.board.every((row) => row.length === 19)).toBe(true)
  })

  it('captures surrounded stones in go', () => {
    const state = createGame('go', 9) as GoState
    state.board[1]![1] = -1
    state.board[0]![1] = 1
    state.board[1]![0] = 1
    state.board[2]![1] = 1
    const next = applyGameMove(state, 'C2').state as GoState
    expect(next.board[1]![1]).toBe(0)
    expect(next.captures.first).toBe(1)
  })

  it('ends go after two passes and applies komi', () => {
    let state = createGame('go', 9)
    state = applyGameMove(state, 'PASS').state
    expect((state as GoState).previousBoard).toBeUndefined()
    state = applyGameMove(state, 'PASS').state
    expect(state.result).toMatchObject({ winner: 'second', draw: false })
  })

  it.each([
    ['gomoku', '黑方认输，白方获胜'],
    ['xiangqi', '红方认输，黑方获胜'],
    ['go', '黑方认输，白方获胜'],
    ['chess', '白方认输，黑方获胜'],
  ] as const)('ends %s immediately when the first seat resigns', (kind: GameKind, label: string) => {
    const state = createGame(kind)
    const resigned = resignGame(state, 'first')

    expect(state.result).toBeUndefined()
    expect(resigned.result).toEqual({ winner: 'second', draw: false, label })
    expect(getLegalMoves(resigned)).toHaveLength(0)
    expect(() => resignGame(resigned, 'second')).toThrow('棋局已经结束')
  })

  it('awards the game to the first seat when the second seat resigns', () => {
    const resigned = resignGame(createGame('xiangqi'), 'second')
    expect(resigned.result).toEqual({ winner: 'first', draw: false, label: '黑方认输，红方获胜' })
  })
})
