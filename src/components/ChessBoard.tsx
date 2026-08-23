import { readChessBoard } from '../game/chess'
import { sameCoord, type ChessState, type Coord, type GameMove } from '../game'

interface ChessBoardProps {
  state: ChessState
  legalMoves: GameMove[]
  selected?: Coord
  disabled: boolean
  onPoint: (coord: Coord) => void
}

const PIECES: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

export function ChessBoard({ state, legalMoves, selected, disabled, onPoint }: ChessBoardProps) {
  const board = readChessBoard(state)
  const targets = legalMoves.filter((move) => sameCoord(move.from, selected)).map((move) => move.to)
  const lastId = state.lastMoveId ?? ''
  const lastFrom = lastId.length >= 4 ? { col: lastId.charCodeAt(0) - 97, row: 8 - Number(lastId[1]) } : undefined
  const lastTo = lastId.length >= 4 ? { col: lastId.charCodeAt(2) - 97, row: 8 - Number(lastId[3]) } : undefined

  return (
    <div className="chess-board" role="grid" aria-label="国际象棋棋盘">
      {board.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
        const coord = { row: rowIndex, col: colIndex }
        const isTarget = targets.some((target) => sameCoord(target, coord))
        const isSelected = sameCoord(selected, coord)
        const isLast = sameCoord(lastFrom, coord) || sameCoord(lastTo, coord)
        const pieceKey = piece ? `${piece.color}${piece.type}` : ''
        return (
          <button
            type="button"
            role="gridcell"
            key={`${rowIndex}:${colIndex}`}
            className={`chess-square ${(rowIndex + colIndex) % 2 ? 'dark-square' : 'light-square'} ${isTarget ? 'is-target' : ''} ${isSelected ? 'is-selected' : ''} ${isLast ? 'is-last' : ''}`}
            disabled={disabled}
            onClick={() => onPoint(coord)}
            aria-label={`${String.fromCharCode(97 + colIndex)}${8 - rowIndex}${piece ? ` ${piece.color === 'w' ? '白' : '黑'}棋子` : ''}`}
          >
            {colIndex === 0 && <span className="rank-label">{8 - rowIndex}</span>}
            {rowIndex === 7 && <span className="file-label">{String.fromCharCode(97 + colIndex)}</span>}
            {piece && <span className={`chess-piece piece-${piece.color}`}>{PIECES[pieceKey]}</span>}
            {isTarget && <span className={piece ? 'capture-target' : 'move-target'} />}
          </button>
        )
      }))}
    </div>
  )
}
