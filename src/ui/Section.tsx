import { useId, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Section.module.css';

interface SectionProps {
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
}

export function Section({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: SectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cx(styles.section, className)}>
      <header className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          {title}
        </h2>
        {meta !== undefined && <span className={styles.meta}>{meta}</span>}
        {actions !== undefined && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={cx(styles.body, bodyClassName)}>{children}</div>
    </section>
  );
}
