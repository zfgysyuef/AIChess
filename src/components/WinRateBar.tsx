import type { GameMeta, WinRateEstimate } from '../game'

interface WinRateBarProps {
  meta: GameMeta
  estimate: WinRateEstimate
}

export function WinRateBar({ meta, estimate }: WinRateBarProps) {
  const accessibleLabel = `${meta.first}胜率 ${estimate.first}%，${meta.second}胜率 ${estimate.second}%`
  return (
    <section
      className={`win-rate-panel ${estimate.exact ? 'exact' : ''}`}
      aria-label={accessibleLabel}
      aria-live="polite"
      title={estimate.exact ? '根据终局结果显示' : '由本地局面启发式估算，不代表模型置信度'}
    >
      <div className="win-rate-labels">
        <span className="win-rate-side first" data-seat="first"><small>{meta.first}</small><strong>{estimate.first}%</strong></span>
        <em>{estimate.exact ? '终局结果' : '胜率 · 本地估算'}</em>
        <span className="win-rate-side second" data-seat="second"><strong>{estimate.second}%</strong><small>{meta.second}</small></span>
      </div>
      <div className="win-rate-track" aria-hidden="true">
        <span className="win-rate-first" style={{ width: `${estimate.first}%` }} />
      </div>
    </section>
  )
}
