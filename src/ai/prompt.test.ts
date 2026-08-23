import { describe, expect, it } from 'vitest'
import { createGame, getLegalMoves } from '../game'
import { buildMovePrompt } from './prompt'

function record(ply: number, controller: string, thinking: string) {
  return {
    ply,
    controller,
    actor: controller === 'aiA' ? 'AI A' : 'AI B',
    moveId: `A${ply}`,
    notation: `A${ply}`,
    thinking,
  }
}

describe('AI move prompt', () => {
  it('includes only the current AI seat previous thinking', () => {
    const state = createGame('gomoku')
    const prompt = buildMovePrompt({
      state,
      legalMoves: getLegalMoves(state).slice(0, 3),
      recentMoves: [
        record(1, 'aiA', '我的中心控制计划'),
        record(2, 'aiB', '对手的阻断计划'),
        record(3, 'aiA', '我的连续进攻计划'),
      ],
      currentController: 'aiA',
    })

    expect(prompt).toContain('你此前的思考轨迹')
    expect(prompt).toContain('我的中心控制计划')
    expect(prompt).toContain('我的连续进攻计划')
    expect(prompt).not.toContain('对手的阻断计划')
  })

  it('limits historical reasoning while retaining the newest six entries', () => {
    const state = createGame('gomoku')
    const prompt = buildMovePrompt({
      state,
      legalMoves: getLegalMoves(state).slice(0, 2),
      recentMoves: [
        record(1, 'aiA', '最旧轨迹'),
        ...Array.from({ length: 6 }, (_, index) => record(index + 2, 'aiA', `保留轨迹-${index + 2}`)),
      ],
      currentController: 'aiA',
    })

    expect(prompt).not.toContain('最旧轨迹')
    expect(prompt).toContain('保留轨迹-2')
    expect(prompt).toContain('保留轨迹-7')
  })

  it('truncates an oversized trajectory and keeps the legal moves authoritative', () => {
    const state = createGame('gomoku')
    const prompt = buildMovePrompt({
      state,
      legalMoves: getLegalMoves(state).slice(0, 2),
      recentMoves: [record(1, 'aiA', '思'.repeat(1300))],
      currentController: 'aiA',
    })

    expect(prompt).toContain('[本次轨迹已截断]')
    expect(prompt).toContain('合法着法 ID（必须原样选择其中一个）')
  })
})
