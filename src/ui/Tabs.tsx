import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Tabs.module.css';

export interface TabDef<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
}

interface TabsProps<T extends string> {
  readonly tabs: readonly TabDef<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  children,
}: TabsProps<T>) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next: unknown) => {
        const tab = tabs.find((candidate) => candidate.id === next);
        if (tab) onChange(tab.id);
      }}
      className={className}
    >
      <BaseTabs.List activateOnFocus aria-label={label} className={styles.tablist}>
        {tabs.map((tab) => (
          <BaseTabs.Tab key={tab.id} value={tab.id} className={styles.tab}>
            {tab.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {children}
    </BaseTabs.Root>
  );
}

interface TabPanelProps {
  readonly value: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  return (
    <BaseTabs.Panel value={value} keepMounted className={cx(styles.panel, className)}>
      {children}
    </BaseTabs.Panel>
  );
}
