import useGameUiSound from './useGameUiSound';

const VARIANT_TO_COLOUR = {
  primary: 'blue',
  success: 'green',
  danger: 'red',
  accent: 'yellow',
  neutral: 'grey',
  warning: 'yellow',
};

/**
 * Kenney UI Pack button.
 * @param {'primary'|'success'|'danger'|'accent'|'neutral'|'warning'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {'rect'|'square'|'round'} shape
 */
export default function GameUiButton({
  children,
  variant = 'primary',
  size = 'md',
  shape = 'rect',
  line = false,
  block = false,
  pressed = false,
  sound = 'click',
  muted = false,
  icon = null,
  iconSrc = null,
  className = '',
  type = 'button',
  onClick,
  disabled,
  title,
  ...rest
}) {
  const { play } = useGameUiSound({ muted });
  const colour = VARIANT_TO_COLOUR[variant] || VARIANT_TO_COLOUR.primary;

  const classes = [
    'gui-btn',
    shape === 'square' ? 'gui-btn--square' : shape === 'round' ? 'gui-btn--round' : `gui-btn--${size}`,
    `gui-btn--${colour}`,
    line ? 'gui-btn--line' : '',
    block ? 'gui-btn--block' : '',
    pressed ? 'gui-btn--pressed' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      className={classes}
      onClick={(e) => {
        if (!disabled && sound) play(sound);
        onClick?.(e);
      }}
      {...rest}
    >
      {iconSrc ? (
        <img src={iconSrc} alt="" className="gui-btn__icon" draggable={false} />
      ) : null}
      {icon ? <span className="gui-btn__icon-slot">{icon}</span> : null}
      {children}
    </button>
  );
}
