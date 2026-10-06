import { GUI } from '../../lib/gameUiAssets';

export default function GameUiBadge({
  children,
  tone = 'yellow',
  star = false,
  className = '',
}) {
  const toneClass = tone === 'blue' ? 'gui-badge--blue' : tone === 'green' ? 'gui-badge--green' : '';
  return (
    <span className={`gui-badge ${toneClass} ${className}`.trim()}>
      {star ? (
        <img src={GUI.icon.star('Yellow')} alt="" className="gui-badge__star" draggable={false} />
      ) : null}
      {children}
    </span>
  );
}
