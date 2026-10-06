import GameUiPanel from './GameUiPanel';
import GameUiButton from './GameUiButton';

/**
 * Absolute-positioned modal over a game stage (parent should be relative).
 */
export default function GameUiModal({
  open,
  title = '',
  header = 'green',
  dark = false,
  onClose,
  children,
  confirmLabel = 'Accept',
  cancelLabel = 'Cancel',
  onConfirm = null,
  confirmDisabled = false,
  confirmVariant = 'success',
  className = '',
  showActions = true,
  muted = false,
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="gui-modal-backdrop"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div className={`gui-modal absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(22rem,calc(100%-1.5rem))] z-50 ${className}`.trim()}>
        <GameUiPanel title={title} header={header} dark={dark} onClose={onClose}>
          <div className="space-y-3">
            {children}
            {showActions ? (
              <div className="flex gap-2 pt-1">
                {typeof onConfirm === 'function' ? (
                  <GameUiButton
                    variant={confirmVariant}
                    block
                    disabled={confirmDisabled}
                    muted={muted}
                    onClick={onConfirm}
                  >
                    {confirmLabel}
                  </GameUiButton>
                ) : null}
                <GameUiButton variant="neutral" line={!dark} muted={muted} onClick={onClose}>
                  {cancelLabel}
                </GameUiButton>
              </div>
            ) : null}
          </div>
        </GameUiPanel>
      </div>
    </>
  );
}
