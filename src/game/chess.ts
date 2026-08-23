import { Chess } from 'chess.js'
import type { ChessState, Coord, GameMove, Seat } from './types'

function squareToCoord(square: string): Coord {
  return {
    col: square.charCodeAt(0) - 97,
    row: 8 - Number(square[1]),
  }
}

function seatFromTurn(turn: 'w' | 'b'): Seat {
  return turn === 'w' ? 'first' : 'second'
}

export function createChessState(): ChessState {
  const chess = new Chess()
  return { kind: 'chess', fen: chess.fen(), turn: 'first' }
}

export function getChessMoves(state: ChessState): GameMove[] {
  if (state.result) return []
  const chess = new Chess(state.fen)
  return chess.moves({ verbose: true }).map((move) => ({
    id: `${move.from}${move.to}${move.promotion ?? ''}`,
    notation: move.san,
    from: squareToCoord(move.from),
    to: squareToCoord(move.to),
  }))
}

function getChessResult(chess: Chess): ChessState['result'] {
  if (chess.isCheckmate()) {
    const winner: Seat = chess.turn() === 'w' ? 'second' : 'first'
    return { winner, draw: false, label: `${winner === 'first' ? '白方' : '黑方'}将死获胜` }
  }
  if (chess.isStalemate()) return { draw: true, label: '逼和' }
  if (chess.isThreefoldRepetition()) return { draw: true, label: '三次重复，和棋' }
  if (chess.isInsufficientMaterial()) return { draw: true, label: '子力不足，和棋' }
  if (chess.isDraw()) return { draw: true, label: '和棋' }
  return undefined
}

export function applyChessMove(state: ChessState, selected: GameMove): ChessState {
  const chess = new Chess(state.fen)
  const legal = getChessMoves(state).find((move) => move.id.toLowerCase() === selected.id.toLowerCase())
  if (!legal) throw new Error('这一步不符合国际象棋规则')
  const promotion = legal.id.length > 4 ? legal.id[4] : undefined
  const played = chess.move({ from: legal.id.slice(0, 2), to: legal.id.slice(2, 4), promotion })
  if (!played) throw new Error('国际象棋引擎拒绝了这一步')

  return {
    kind: 'chess',
    fen: chess.fen(),
    turn: seatFromTurn(chess.turn()),
    lastMove: legal.to,
    lastMoveId: legal.id,
    result: getChessResult(chess),
  }
}

export function readChessBoard(state: ChessState) {
  return new Chess(state.fen).board()
}

export function isChessCheck(state: ChessState): boolean {
  return new Chess(state.fen).isCheck()
}
