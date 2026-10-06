export default function GameUiProgress({
  value = 0,
  max = 1,
  colour = 'blue',
  className = '',
}) {
  const pct = Math.max(0, Math.min(100, (Number(value) / Math.max(1e-6, Number(max) || 1)) * 100));
  const colourClass = colour === 'green'
    ? 'gui-progress--green'
    : colour === 'yellow'
      ? 'gui-progress--yellow'
      : colour === 'red'
        ? 'gui-progress--red'
        : '';
  return (
    <div
      className={`gui-progress ${colourClass} ${className}`.trim()}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="gui-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
