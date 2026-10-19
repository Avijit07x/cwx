import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { CheckCircleIcon, CloseIcon, InfoIcon, WarningIcon } from './icons';
import styles from './Toaster.module.css';

const ICONS: ToasterProps['icons'] = {
  success: <CheckCircleIcon />,
  info: <InfoIcon />,
  error: <WarningIcon />,
  close: <CloseIcon />,
};

function announceAssertively(region: HTMLElement | null): void {
  region?.setAttribute('aria-live', 'assertive');
}

interface ToasterLabels {
  readonly notifications: string;
  readonly errorNotifications: string;
  readonly dismiss: string;
}

export function Toaster({
  alertId,
  labels,
}: {
  readonly alertId: string;
  readonly labels: ToasterLabels;
}) {
  const shared: ToasterProps = {
    position: 'bottom-center',
    offset: 0,
    mobileOffset: 0,
    gap: 8,
    hotkey: [],
    closeButton: true,
    icons: ICONS,
    className: styles.stack,
    toastOptions: {
      unstyled: true,
      closeButtonAriaLabel: labels.dismiss,
      classNames: {
        toast: styles.toast,
        icon: styles.icon,
        content: styles.content,
        closeButton: styles.dismiss,
        success: styles.success,
        error: styles.error,
      },
    },
  };
  return (
    <div className={styles.region}>
      <Sonner {...shared} customAriaLabel={labels.notifications} />
      <Sonner
        {...shared}
        id={alertId}
        ref={announceAssertively}
        customAriaLabel={labels.errorNotifications}
      />
    </div>
  );
}
