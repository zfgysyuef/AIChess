import { Xiangqi, makeUci, parseUci, squareFile, squareRank, type Color, type Piece } from 'elephantops'
import { makeFen, parseFen } from 'elephantops/fen'
import { makeSan } from 'elephantops/san'
import type { Coord, GameMove, Seat, XiangqiState } from './types'

function seatFromColor(color: Color): Seat {
  return color === 'red' ? 'first' : 'second'
}

function squareToCoord(square: number): Coord {
  return { row: 9 - squareRank(square), col: squareFile(square) }
}

export function positionFromXiangqiState(state: XiangqiState): Xiangqi {
  return Xiangqi.fromSetup(parseFen(state.fen).unwrap()).unwrap()
}

export function createXiangqiState(): XiangqiState {
  const position = Xiangqi.default()
  return {
    kind: 'xiangqi',
    fen: makeFen(position.toSetup()),
    turn: 'first',
  }
}

export function getXiangqiMoves(state: XiangqiState): GameMove[] {
  if (state.result) return []
  const position = positionFromXiangqiState(state)
  const moves: GameMove[] = []
  for (const [from, destinations] of position.allDests()) {
    for (const to of destinations) {
      const move = { from, to }
      moves.push({
        id: makeUci(move),
        notation: makeSan(position, move),
        from: squareToCoord(from),
        to: squareToCoord(to),
      })
    }
  }
  return moves
}

export function applyXiangqiMove(state: XiangqiState, selected: GameMove): XiangqiState {
  const position = positionFromXiangqiState(state)
  const legal = getXiangqiMoves(state).find((move) => move.id.toLowerCase() === selected.id.toLowerCase())
  if (!legal) throw new Error('这一步不符合象棋规则')
  const parsed = parseUci(legal.id)
  if (!parsed || !position.isLegal(parsed)) throw new Error('象棋引擎拒绝了这一步')
  position.play(parsed)
  const outcome = position.outcome()
  const winner = outcome?.winner ? seatFromColor(outcome.winner) : undefined

  return {
    kind: 'xiangqi',
    fen: makeFen(position.toSetup()),
    turn: seatFromColor(position.turn),
    lastMove: legal.to,
    lastMoveId: legal.id,
    result: outcome
      ? {
          winner,
          draw: !winner,
          label: winner ? `${winner === 'first' ? '红方' : '黑方'}获胜` : '和棋',
        }
      : undefined,
  }
}

export function readXiangqiPiece(state: XiangqiState, row: number, col: number): Piece | undefined {
  const square = col + (9 - row) * 9
  return positionFromXiangqiState(state).board.get(square)
}

export function readXiangqiBoard(state: XiangqiState): Array<Array<Piece | undefined>> {
  const position = positionFromXiangqiState(state)
  return Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) => position.board.get(col + (9 - row) * 9)),
  )
}

export function isXiangqiCheck(state: XiangqiState): boolean {
  return positionFromXiangqiState(state).isCheck()
}
