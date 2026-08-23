import { readXiangqiBoard } from '../game/xiangqi'
import { sameCoord, type Coord, type GameMove, type XiangqiState } from '../game'

interface XiangqiBoardProps {
  state: XiangqiState
  legalMoves: GameMove[]
  selected?: Coord
  disabled: boolean
  onPoint: (coord: Coord) => void
}

const PIECE_NAMES = {
  red: { king: '帅', advisor: '仕', elephant: '相', horse: '马', chariot: '车', cannon: '炮', pawn: '兵' },
  black: { king: '将', advisor: '士', elephant: '象', horse: '马', chariot: '车', cannon: '炮', pawn: '卒' },
} as const

export function XiangqiBoard({ state, legalMoves, selected, disabled, onPoint }: XiangqiBoardProps) {
  const board = readXiangqiBoard(state)
  const targets = legalMoves.filter((move) => sameCoord(move.from, selected)).map((move) => move.to)

  return (
    <div className="xiangqi-board" role="grid" aria-label="中国象棋棋盘">
      <div className="xiangqi-plane">
        <div className="xq-lines" aria-hidden="true">
          {Array.from({ length: 10 }, (_, row) => <span className="xq-horizontal" key={`h${row}`} style={{ top: `${row / 9 * 100}%` }} />)}
          {Array.from({ length: 9 }, (_, col) => col === 0 || col === 8
            ? <span className="xq-vertical full" key={`v${col}`} style={{ left: `${col / 8 * 100}%` }} />
            : <span className="xq-vertical-pair" key={`v${col}`} style={{ left: `${col / 8 * 100}%` }}><i /><i /></span>)}
          <span className="xq-palace palace-top palace-a" /><span className="xq-palace palace-top palace-b" />
          <span className="xq-palace palace-bottom palace-a" /><span className="xq-palace palace-bottom palace-b" />
          <span className="river-label river-left">楚河</span><span className="river-label river-right">汉界</span>
        </div>
        {board.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
          const coord = { row: rowIndex, col: colIndex }
          const outgoing = legalMoves.some((move) => sameCoord(move.from, coord))
          const target = targets.some((to) => sameCoord(to, coord))
          const isSelected = sameCoord(selected, coord)
          const isLast = sameCoord(state.lastMove, coord)
          return (
            <button
              type="button"
              role="gridcell"
              key={`${rowIndex}:${colIndex}`}
              className={`xq-point ${target ? 'is-target' : ''} ${outgoing ? 'has-moves' : ''} ${isSelected ? 'is-selected' : ''} ${isLast ? 'is-last' : ''}`}
              style={{ left: `${colIndex / 8 * 100}%`, top: `${rowIndex / 9 * 100}%` }}
              disabled={disabled}
              onClick={() => onPoint(coord)}
              aria-label={`${colIndex + 1}路${rowIndex + 1}行${piece ? ` ${PIECE_NAMES[piece.color][piece.role]}` : ''}`}
            >
              {piece && <span className={`xq-piece xq-${piece.color}`}>{PIECE_NAMES[piece.color][piece.role]}</span>}
              {target && <span className={piece ? 'xq-capture-target' : 'xq-move-target'} />}
            </button>
          )
        }))}
      </div>
    </div>
  )
}
