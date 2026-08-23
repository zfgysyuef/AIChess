import type { Coord, GameMove, GameState } from '../game'
import { ChessBoard } from './ChessBoard'
import { GridBoard } from './GridBoard'
import { XiangqiBoard } from './XiangqiBoard'

interface GameBoardProps {
  state: GameState
  legalMoves: GameMove[]
  selected?: Coord
  disabled: boolean
  onPoint: (coord: Coord) => void
}

export function GameBoard(props: GameBoardProps) {
  const { state } = props
  if (state.kind === 'gomoku' || state.kind === 'go') return <GridBoard {...props} state={state} />
  if (state.kind === 'chess') return <ChessBoard {...props} state={state} />
  return <XiangqiBoard {...props} state={state} />
}
