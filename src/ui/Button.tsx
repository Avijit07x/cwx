import type { ComponentProps, ReactNode } from 'react';
import styles from './Button.module.css';
import { cx } from './cx';
import { Tooltip, type TooltipPlacement } from './Tooltip';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';
type ControlSize = 'sm' | 'md';

interface ButtonProps extends ComponentProps<'button'> {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
  readonly icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], size === 'sm' && styles.sm, className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  readonly label: string;
  readonly icon: ReactNode;
  readonly shortcut?: string;
  readonly ariaShortcut?: string;
  readonly variant?: 'ghost' | 'secondary';
  readonly size?: ControlSize;
  readonly pressed?: boolean;
  readonly tooltip?: TooltipPlacement | 'none';
}

export function IconButton({
  label,
  icon,
  shortcut,
  ariaShortcut,
  variant = 'ghost',
  size = 'md',
  pressed,
  tooltip = 'bottom',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-keyshortcuts={ariaShortcut}
      aria-pressed={pressed}
      className={cx(
        styles.button,
        styles[variant],
        styles.icon,
        size === 'sm' && styles.sm,
        pressed && styles.pressed,
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
  if (tooltip === 'none') return button;
  return (
    <Tooltip content={shortcut ? `${label} · ${shortcut}` : label} placement={tooltip}>
      {button}
    </Tooltip>
  );
}
