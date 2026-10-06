import GameUiButton from './GameUiButton';

/**
 * Kenney-framed panel with optional coloured header bar.
 */
export default function GameUiPanel({
  title = null,
  header = 'blue',
  dark = false,
  flush = false,
  onClose = null,
  muted = false,
  className = '',
  bodyClassName = '',
  children,
  headerRight = null,
}) {
  const headerClass = [
    'gui-panel__header',
    `gui-panel__header--${header}`,
  ].join(' ');

  return (
    <div className={`gui-panel ${dark ? 'gui-panel--dark' : ''} ${className}`.trim()}>
      {title != null ? (
        <div className={headerClass}>
          <span className="truncate">{title}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {headerRight}
            {typeof onClose === 'function' ? (
              <GameUiButton
                shape="round"
                variant="danger"
                muted={muted}
                aria-label="Close"
                sound="tap"
                onClick={onClose}
                className="!w-[1.85rem] !h-[1.85rem] !min-h-0 !p-0"
                iconSrc="/game-ui/PNG/Red/Default/icon_cross.png"
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={`gui-panel__body ${flush ? 'gui-panel__body--flush' : ''} ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}
