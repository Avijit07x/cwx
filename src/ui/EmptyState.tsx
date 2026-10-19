import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly tone?: 'neutral' | 'success';
  readonly className?: string;
}

export function EmptyState({
  icon,
  title,
  children,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, tone === 'success' && styles.success, className)}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
