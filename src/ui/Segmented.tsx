import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Segmented.module.css';
import { Tooltip } from './Tooltip';

export interface SegmentedOption<V extends string | number> {
  readonly value: V;
  readonly label: ReactNode;
  readonly title?: string;
}

interface SegmentedProps<V extends string | number> {
  readonly legend: string;
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly size?: 'sm' | 'md';
  readonly disabled?: boolean;
  readonly className?: string;
}

export function Segmented<V extends string | number>({
  legend,
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
  className,
}: SegmentedProps<V>) {
  return (
    <RadioGroup<V>
      aria-label={legend}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      className={cx(styles.group, size === 'sm' && styles.sm, className)}
    >
      {options.map((option) => (
        <Tooltip
          key={String(option.value)}
          content={option.title}
          disabled={option.title === undefined}
        >
          <Radio.Root value={option.value} className={styles.option}>
            {option.label}
          </Radio.Root>
        </Tooltip>
      ))}
    </RadioGroup>
  );
}
