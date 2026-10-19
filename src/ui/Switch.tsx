import { Switch as BaseSwitch } from '@base-ui/react/switch';
import styles from './Switch.module.css';

interface SwitchProps {
  readonly id?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly 'aria-describedby'?: string;
}

export function Switch(props: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      nativeButton
      render={<button type="button" />}
      className={styles.root}
    >
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  );
}
