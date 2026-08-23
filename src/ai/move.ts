import type { GameMove } from '../game'

function normalize(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .replace(/^["'`“”]+|["'`“”]+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
}

function normalizeNotation(value: string): string {
  return normalize(value).replace(/0/g, 'O').replace(/[!?]+$/g, '')
}

export function resolveAIChoice(choice: string, legalMoves: GameMove[]): GameMove | undefined {
  const candidate = normalize(choice)
  if (!candidate) return undefined

  const exact = legalMoves.find((move) => normalize(move.id) === candidate)
  if (exact) return exact

  const annotated = legalMoves.filter((move) => {
    const id = normalize(move.id)
    if (!candidate.startsWith(id) || candidate.length === id.length) return false
    return ['[', '(', '|', ':'].includes(candidate[id.length]!)
  })
  if (annotated.length === 1) return annotated[0]

  const notation = normalizeNotation(choice)
  const notationMatches = legalMoves.filter((move) => normalizeNotation(move.notation) === notation)
  return notationMatches.length === 1 ? notationMatches[0] : undefined
}
