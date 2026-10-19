import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

const PLACEMENTS = {
  bottom: { side: 'bottom', align: 'center' },
  'bottom-end': { side: 'bottom', align: 'end' },
  top: { side: 'top', align: 'center' },
} as const;

export type TooltipPlacement = keyof typeof PLACEMENTS;

interface TooltipProps {
  readonly content: ReactNode;
  readonly placement?: TooltipPlacement;
  readonly disabled?: boolean;
  readonly children: ReactElement;
}

export function Tooltip({
  content,
  placement = 'bottom',
  disabled = false,
  children,
}: TooltipProps) {
  const { side, align } = PLACEMENTS[placement];
  return (
    <BaseTooltip.Root disabled={disabled}>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          side={side}
          align={align}
          sideOffset={6}
          className={styles.positioner}
        >
          <BaseTooltip.Popup className={styles.popup}>{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export function TooltipProvider({ children }: { readonly children: ReactNode }) {
  return <BaseTooltip.Provider delay={350}>{children}</BaseTooltip.Provider>;
}
