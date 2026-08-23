import { BOARD_FILES, coordToId, sameCoord, type Coord, type GameMove, type GoState, type GomokuState } from '../game'

interface GridBoardProps {
  state: GomokuState | GoState
  legalMoves: GameMove[]
  disabled: boolean
  onPoint: (coord: Coord) => void
}

function starPoints(size: number): Set<string> {
  const values = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : size === 9 ? [2, 4, 6] : [3, 7, 11]
  const stars = new Set<string>()
  for (const row of values) for (const col of values) stars.add(`${row}:${col}`)
  if (size === 15) {
    for (const key of [...stars]) if (!['3:3', '3:11', '7:7', '11:3', '11:11'].includes(key)) stars.delete(key)
  }
  return stars
}

export function GridBoard({ state, legalMoves, disabled, onPoint }: GridBoardProps) {
  const size = state.kind === 'go' ? state.size : 15
  const legal = new Set(legalMoves.filter((move) => move.to).map((move) => `${move.to!.row}:${move.to!.col}`))
  const stars = starPoints(size)

  return (
    <div
      className={`grid-board ${state.kind === 'go' ? 'go-board' : 'gomoku-board'}`}
      style={{ '--board-size': size } as React.CSSProperties}
      role="grid"
      aria-label={`${state.kind === 'go' ? '围棋' : '五子棋'}棋盘`}
    >
      {Array.from({ length: size * size }, (_, index) => {
        const row = Math.floor(index / size)
        const col = index % size
        const value = state.board[row]?.[col] ?? 0
        const key = `${row}:${col}`
        const isLegal = legal.has(key)
        const isLast = sameCoord(state.lastMove, { row, col })
        const black = state.kind === 'go' ? value === 1 : value === 1
        const white = state.kind === 'go' ? value === -1 : value === 2
        return (
          <button
            type="button"
            role="gridcell"
            key={key}
            className={`grid-point ${row === 0 ? 'edge-top' : ''} ${row === size - 1 ? 'edge-bottom' : ''} ${col === 0 ? 'edge-left' : ''} ${col === size - 1 ? 'edge-right' : ''} ${isLegal ? 'is-legal' : ''}`}
            aria-label={`${coordToId({ row, col })}${black ? ' 黑子' : white ? ' 白子' : ''}`}
            disabled={disabled || !isLegal}
            onClick={() => onPoint({ row, col })}
          >
            {row === size - 1 && <span className="grid-file-label">{BOARD_FILES[col]}</span>}
            {col === 0 && <span className="grid-rank-label">{row + 1}</span>}
            {stars.has(key) && !value && <span className="star-point" />}
            {value !== 0 && (
              <span className={`stone ${black ? 'stone-black' : 'stone-white'}`}>
                {isLast && <span className="last-mark" />}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
