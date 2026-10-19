import { Dialog } from '@base-ui/react/dialog';
import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { useT } from '../../i18n/useT';
import { notify } from '../../state/actions';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { setShortcutHelpOpen, useShortcutStore } from './shortcutStore';

const ShortcutHelpPopup = lazy(() => import('./ShortcutHelpPopup'));

function ShortcutListUnavailable() {
  const t = useT();
  useEffect(() => {
    if (!useShortcutStore.getState().helpOpen) return;
    setShortcutHelpOpen(false);
    notify('error', t.t('shortcuts.unavailable'));
  }, [t]);
  return null;
}

interface ShortcutHelpDialogProps {
  readonly trigger: ReactElement;
}

export function ShortcutHelpDialog({ trigger }: ShortcutHelpDialogProps) {
  const open = useShortcutStore((state) => state.helpOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setShortcutHelpOpen}>
      <Dialog.Trigger render={trigger} />
      <Dialog.Portal>
        <ErrorBoundary fallback={() => <ShortcutListUnavailable />}>
          <Suspense>
            <ShortcutHelpPopup />
          </Suspense>
        </ErrorBoundary>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
