import { describe, expect, it } from 'vitest'
import { createGame, getLegalMoves, type GameMove } from '../game'
import { resolveAIChoice } from './move'

describe('AI legal move resolver', () => {
  it('accepts an exact legal move ID', () => {
    const legal = getLegalMoves(createGame('chess'))
    expect(resolveAIChoice(' E2E4 ', legal)?.id).toBe('e2e4')
  })

  it('removes copied chess notation appended to a legal ID', () => {
    const legal = getLegalMoves(createGame('chess'))
    expect(resolveAIChoice('e2e4[e4]', legal)?.id).toBe('e2e4')
    expect(resolveAIChoice('e2e4 | e4', legal)?.id).toBe('e2e4')
  })

  it('resolves a unique SAN chess move', () => {
    const legal = getLegalMoves(createGame('chess'))
    expect(resolveAIChoice('e4', legal)?.id).toBe('e2e4')
  })

  it('resolves copied Xiangqi notation without weakening legality checks', () => {
    const legal = getLegalMoves(createGame('xiangqi'))
    const cannon = legal.find((move) => move.id === 'h3e3')!
    expect(resolveAIChoice(`${cannon.id}[${cannon.notation}]`, legal)?.id).toBe(cannon.id)
    expect(resolveAIChoice(cannon.notation, legal)?.id).toBe(cannon.id)
    expect(resolveAIChoice('z9z8[不存在的着法]', legal)).toBeUndefined()
  })

  it('rejects ambiguous notation', () => {
    const legal: GameMove[] = [
      { id: 'a1a2', notation: '相同记法' },
      { id: 'b1b2', notation: '相同记法' },
    ]
    expect(resolveAIChoice('相同记法', legal)).toBeUndefined()
  })
})
