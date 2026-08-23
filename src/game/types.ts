export type GameKind = 'gomoku' | 'xiangqi' | 'go' | 'chess'
export type Seat = 'first' | 'second'

export interface Coord {
  row: number
  col: number
}

export interface GameResult {
  winner?: Seat
  draw: boolean
  label: string
}

export interface GameMove {
  id: string
  notation: string
  from?: Coord
  to?: Coord
  isPass?: boolean
}

interface BaseState {
  kind: GameKind
  turn: Seat
  result?: GameResult
  lastMove?: Coord
}

export type GomokuCell = 0 | 1 | 2

export interface GomokuState extends BaseState {
  kind: 'gomoku'
  board: GomokuCell[][]
  turn: Seat
}

export type GoSign = -1 | 0 | 1

export interface GoScore {
  black: number
  white: number
}

export interface GoState extends BaseState {
  kind: 'go'
  board: GoSign[][]
  previousBoard?: GoSign[][]
  size: 9 | 13 | 19
  passCount: number
  captures: { first: number; second: number }
  komi: number
  score?: GoScore
  lastMoveWasPass?: boolean
}

export interface ChessState extends BaseState {
  kind: 'chess'
  fen: string
  lastMoveId?: string
}

export interface XiangqiState extends BaseState {
  kind: 'xiangqi'
  fen: string
  lastMoveId?: string
}

export type GameState = GomokuState | GoState | ChessState | XiangqiState

export interface AppliedMove {
  state: GameState
  move: GameMove
}

export interface GameMeta {
  kind: GameKind
  name: string
  shortName: string
  first: string
  second: string
  rule: string
}
