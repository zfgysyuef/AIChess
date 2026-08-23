import { useEffect } from 'react'
import { Flag, X } from 'lucide-react'
import type { MatchMode } from '../config'
import { GAME_META, type GameKind, type Seat } from '../game'

interface ResignModalProps {
  open: boolean
  game: GameKind
  mode: MatchMode
  humanSeat: Seat
  resigningSeat: Seat
  onSelectSeat: (seat: Seat) => void
  onClose: () => void
  onConfirm: () => void
}

function participantLabel(mode: MatchMode, humanSeat: Seat, seat: Seat): string {
  if (mode === 'ai-ai') return seat === 'first' ? 'AI A' : 'AI B'
  return seat === humanSeat ? '你' : 'AI A'
}

export function ResignModal({
  open,
  game,
  mode,
  humanSeat,
  resigningSeat,
  onSelectSeat,
  onClose,
  onConfirm,
}: ResignModalProps) {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  if (!open) return null

  const meta = GAME_META[game]
  const winnerSeat: Seat = resigningSeat === 'first' ? 'second' : 'first'
  const resigningSide = resigningSeat === 'first' ? meta.first : meta.second
  const winnerSide = winnerSeat === 'first' ? meta.first : meta.second
  const resigningPlayer = participantLabel(mode, humanSeat, resigningSeat)
  const winningPlayer = participantLabel(mode, humanSeat, winnerSeat)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal resign-modal" role="dialog" aria-modal="true" aria-labelledby="resign-title" aria-describedby="resign-summary">
        <header className="modal-header">
          <div>
            <p className="eyebrow">MATCH ACTION</p>
            <h2 id="resign-title">确认认输</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭" aria-label="关闭认输确认">
            <X size={20} />
          </button>
        </header>

        <div className="modal-body resign-body">
          {mode === 'ai-ai' && (
            <fieldset className="resign-seat-field">
              <legend>认输方</legend>
              <div className="segmented-control resign-seat-control">
                {(['first', 'second'] as const).map((seat) => (
                  <button type="button" key={seat} className={resigningSeat === seat ? 'active' : ''} onClick={() => onSelectSeat(seat)}>
                    <span className={`profile-dot ${seat === 'first' ? 'profile-a' : 'profile-b'}`} />
                    <span><strong>{seat === 'first' ? 'AI A' : 'AI B'}</strong><small>{seat === 'first' ? meta.first : meta.second}</small></span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="resign-summary" id="resign-summary">
            <span className="resign-symbol"><Flag size={20} /></span>
            <p><strong>{resigningPlayer}（{resigningSide}）</strong>认输后，本局立即结束，并判<strong>{winningPlayer}（{winnerSide}）</strong>获胜。</p>
          </div>
        </div>

        <footer className="modal-footer resign-footer">
          <div className="modal-actions">
            <button type="button" className="text-button" onClick={onClose}>取消</button>
            <button type="button" className="primary-button small danger-button" onClick={onConfirm} autoFocus><Flag size={16} />确认认输</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
