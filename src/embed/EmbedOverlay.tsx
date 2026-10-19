import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { formatCountdown } from '../i18n/format';
import { useT } from '../i18n/useT';
import { notify } from '../state/actions';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { ArrowRightIcon, WarningIcon } from '../ui/icons';
import { requestQuote, TOKEN_REFRESH_LEAD_MS, useEmbed, type EmbedErrorReason } from './bridge';
import styles from './EmbedOverlay.module.css';

function useFocusHandover<T extends HTMLElement>(handoverRef: RefObject<boolean>) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (handoverRef.current) element?.focus();
    handoverRef.current = false;
    return () => {
      handoverRef.current =
        document.hasFocus() && element?.contains(document.activeElement) === true;
    };
  }, [handoverRef]);
  return ref;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

interface BlockingDialogProps {
  readonly role?: 'alertdialog';
  readonly title: string;
  readonly description: ReactNode;
  readonly icon: ReactNode;
  readonly children?: ReactNode;
}

function BlockingDialog({ role, title, description, icon, children }: BlockingDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const mustAct = role === 'alertdialog';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let modal = false;
    const openModal = () => {
      modal = true;
      dialog.showModal();
    };
    const keepOpen = () => {
      if (dialog.open) return;
      if (mustAct || document.hasFocus()) openModal();
      else dialog.open = true;
    };
    const takeOverOnFocus = () => {
      if (modal) return;
      dialog.close();
      keepOpen();
    };
    const preventCancel = (event: Event) => {
      event.preventDefault();
    };
    keepOpen();
    dialog.addEventListener('cancel', preventCancel);
    dialog.addEventListener('close', keepOpen);
    window.addEventListener('focus', takeOverOnFocus);
    return () => {
      window.removeEventListener('focus', takeOverOnFocus);
      dialog.removeEventListener('cancel', preventCancel);
      dialog.removeEventListener('close', keepOpen);
      dialog.close();
    };
  }, [mustAct]);

  return (
    <dialog
      ref={ref}
      role={role}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {icon}
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div id={descriptionId} className={styles.description}>
        {description}
      </div>
      {children}
    </dialog>
  );
}

function ConnectingDialog() {
  const t = useT();
  return (
    <BlockingDialog
      title={t.t('embed.connecting')}
      description={<p>{t.t('embed.connectingHint')}</p>}
      icon={<span className={styles.spinner} aria-hidden="true" />}
    />
  );
}

function ErrorDialog({ reason }: { readonly reason: EmbedErrorReason }) {
  const t = useT();
  return (
    <BlockingDialog
      role="alertdialog"
      title={t.t('embed.errorTitle')}
      description={
        <>
          <p>{t.t(`embed.error.${reason}`)}</p>
          <p className={styles.code}>{t.t('embed.errorCode', { code: reason })}</p>
        </>
      }
      icon={
        <span className={styles.errorIcon}>
          <WarningIcon size={20} />
        </span>
      }
    >
      {reason === 'init-timeout' && (
        <Button
          variant="primary"
          className={styles.action}
          onClick={() => {
            window.location.reload();
          }}
        >
          {t.t('embed.reload')}
        </Button>
      )}
    </BlockingDialog>
  );
}

function TokenLifetime({ tokenExpiresAt }: { readonly tokenExpiresAt: number }) {
  const t = useT();
  const remainingMs = tokenExpiresAt - useNow(1000);
  return (
    <>
      <p className={styles.status}>
        <span
          className={cx(styles.dot, remainingMs <= TOKEN_REFRESH_LEAD_MS && styles.dotRenewing)}
          aria-hidden="true"
        />
        <span className={styles.label}>{t.t('embed.badgeLabel')}</span>
      </p>
      <p className={cx(styles.lifetime, 'num')}>
        {t.t('embed.tokenValid', { time: formatCountdown(remainingMs) })}
      </p>
    </>
  );
}

interface HandoverProps {
  readonly handoverRef: RefObject<boolean>;
}

function ConnectedBadge({
  tokenExpiresAt,
  handoverRef,
}: HandoverProps & { readonly tokenExpiresAt: number }) {
  const t = useT();
  const quoteRef = useFocusHandover<HTMLButtonElement>(handoverRef);
  return (
    <section className={styles.badge} aria-label={t.t('embed.badgeRegion')}>
      <TokenLifetime key={tokenExpiresAt} tokenExpiresAt={tokenExpiresAt} />
      <Button
        ref={quoteRef}
        size="sm"
        variant="primary"
        icon={<ArrowRightIcon size={14} />}
        onClick={() => {
          if (requestQuote()) notify('success', t.t('embed.quoteSent'));
        }}
      >
        {t.t('embed.sendQuote')}
      </Button>
    </section>
  );
}

function ExpiredNotice({ handoverRef }: HandoverProps) {
  const t = useT();
  const alertRef = useFocusHandover<HTMLDivElement>(handoverRef);
  return (
    <div ref={alertRef} className={cx(styles.badge, styles.expired)} role="alert" tabIndex={-1}>
      <WarningIcon className={styles.expiredIcon} />
      <p>
        <strong className={styles.label}>{t.t('embed.expiredTitle')}</strong>{' '}
        {t.t('embed.expiredBody')}
      </p>
    </div>
  );
}

export function EmbedOverlay() {
  const embed = useEmbed();
  const handoverRef = useRef(false);
  switch (embed.status) {
    case 'waiting':
      return <ConnectingDialog />;
    case 'error':
      return <ErrorDialog reason={embed.reason} />;
    case 'connected':
      return <ConnectedBadge tokenExpiresAt={embed.tokenExpiresAt} handoverRef={handoverRef} />;
    case 'expired':
      return <ExpiredNotice handoverRef={handoverRef} />;
  }
}
