import type { Coord } from './types'

export const BOARD_FILES = 'ABCDEFGHJKLMNOPQRST'

export function coordToId(coord: Coord): string {
  const file = BOARD_FILES[coord.col]
  if (!file) throw new Error('坐标超出棋盘范围')
  return `${file}${coord.row + 1}`
}

export function idToCoord(id: string, size: number): Coord | undefined {
  const match = id.trim().toUpperCase().match(/^([A-HJ-T])(\d{1,2})$/)
  if (!match) return undefined
  const col = BOARD_FILES.indexOf(match[1]!)
  const row = Number(match[2]) - 1
  if (col < 0 || col >= size || row < 0 || row >= size) return undefined
  return { row, col }
}

export function sameCoord(left?: Coord, right?: Coord): boolean {
  return Boolean(left && right && left.row === right.row && left.col === right.col)
}

export function cloneGrid<T>(board: T[][]): T[][] {
  return board.map((row) => [...row])
}
