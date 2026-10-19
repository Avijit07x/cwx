import type { ReactNode } from 'react';
import { WarningIcon } from './icons';
import styles from './StateMessage.module.css';

interface StateMessageProps {
  readonly title: string;
  readonly body?: string;
  readonly action?: ReactNode;
  readonly role?: 'alert' | 'status';
  readonly warning?: boolean;
}

export function StateMessage({ title, body, action, role, warning = true }: StateMessageProps) {
  return (
    <div className={styles.message} role={role}>
      {warning && <WarningIcon size={20} className={styles.icon} />}
      <p className={styles.title}>{title}</p>
      {body && <p className={styles.body}>{body}</p>}
      {action}
    </div>
  );
}
