import { useEffect, useId, useReducer, useState, type ReactNode } from 'react';
import { formatInteger } from '../i18n/format';
import { LOCALE_LABEL, LOCALES, type Locale } from '../i18n/locales';
import { Button } from '../ui/Button';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CheckCircleIcon, GaugeIcon, RotateCwIcon, WarningIcon } from '../ui/icons';
import { Section } from '../ui/Section';
import { Segmented } from '../ui/Segmented';
import { StateMessage } from '../ui/StateMessage';
import { isWebGLAvailable } from '../viewport/webgl';
import styles from './Bench.module.css';
import { BenchViewport, type CompletedRun, type RunEvent } from './BenchViewport';
import { COPY_COUNTS, configSearch, type BenchConfig } from './config';
import { MissingModelError } from './loader';
import { benchTranslator, type BenchTranslate } from './messages';
import { MODEL, VARIANT_IDS } from './model';
import { BENCH_TIMINGS, type Progress } from './protocol';
import { ResultsTable } from './ResultsTable';

type RunState =
  | { readonly status: 'running'; readonly progress: Progress | null }
  | { readonly status: 'done'; readonly run: CompletedRun }
  | { readonly status: 'missing'; readonly url: string }
  | { readonly status: 'failed'; readonly message: string | null }
  | { readonly status: 'unsupported' };

function reduceRun(_state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'progress':
      return { status: 'running', progress: event.progress };
    case 'complete':
      return { status: 'done', run: event.run };
    case 'error':
      if (event.error instanceof MissingModelError) {
        return { status: 'missing', url: event.error.url };
      }
      return {
        status: 'failed',
        message: event.error instanceof Error ? event.error.message : null,
      };
  }
}

function problemTitle(t: BenchTranslate, state: RunState): string | null {
  switch (state.status) {
    case 'missing':
      return t('bench.missing.title');
    case 'failed':
      return t('bench.failed.title');
    case 'unsupported':
      return t('bench.unsupported.title');
    default:
      return null;
  }
}

function initialRunState(): RunState {
  return isWebGLAvailable() ? { status: 'running', progress: null } : { status: 'unsupported' };
}

const PROGRESS_STEPS = BENCH_TIMINGS.loadRuns + 2;

function progressStep(progress: Progress | null): number {
  if (!progress) return 0;
  switch (progress.phase) {
    case 'load':
      return progress.run - 1;
    case 'warmup':
      return BENCH_TIMINGS.loadRuns;
    case 'measure':
      return BENCH_TIMINGS.loadRuns + 1;
  }
}

function progressText(t: BenchTranslate, progress: Progress | null): string {
  if (!progress) return t('bench.status.starting');
  switch (progress.phase) {
    case 'load':
      return t('bench.status.load', { run: progress.run, total: progress.total });
    case 'warmup':
      return t('bench.status.warmup', { seconds: BENCH_TIMINGS.warmupMs / 1000 });
    case 'measure':
      return t('bench.status.measure', { seconds: BENCH_TIMINGS.measureMs / 1000 });
  }
}

function withCommand(template: string, command: string): ReactNode {
  const [before = '', after = ''] = template.split('{command}');
  return (
    <>
      {before}
      <code className={styles.code}>{command}</code>
      {after}
    </>
  );
}

function Callout({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className={styles.callout}>
      <WarningIcon className={styles.calloutIcon} />
      <div className={styles.calloutBody}>
        <p className={styles.calloutTitle}>{title}</p>
        {children}
      </div>
    </div>
  );
}

function StatusContent({
  t,
  state,
  config,
}: {
  readonly t: BenchTranslate;
  readonly state: RunState;
  readonly config: BenchConfig;
}) {
  switch (state.status) {
    case 'running':
      return <p>{progressText(t, state.progress)}</p>;
    case 'done':
      return (
        <p className={styles.done}>
          <CheckCircleIcon />
          {t('bench.status.done')}
        </p>
      );
    case 'missing':
      return (
        <Callout title={t('bench.missing.title')}>
          <p className="mono">{state.url}</p>
          <p>
            {config.model === 'raw'
              ? withCommand(t('bench.missing.raw'), 'pnpm assets:fetch')
              : withCommand(t('bench.missing.lod'), 'pnpm assets:optimize')}
          </p>
        </Callout>
      );
    case 'failed':
      return (
        <Callout title={t('bench.failed.title')}>
          <p>{state.message ?? t('bench.failed.crash')}</p>
        </Callout>
      );
    case 'unsupported':
      return (
        <Callout title={t('bench.unsupported.title')}>
          <p>{t('bench.unsupported.body')}</p>
        </Callout>
      );
  }
}

interface LinkOption {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

function OptionLinks({
  label,
  options,
}: {
  readonly label: string;
  readonly options: readonly LinkOption[];
}) {
  const labelId = useId();
  return (
    <div className={styles.option} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.optionLabel}>
        {label}
      </span>
      <div className={styles.links}>
        {options.map((option) => (
          <a
            key={option.key}
            href={option.href}
            className={styles.link}
            aria-current={option.current ? 'page' : undefined}
          >
            {option.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function ReportCrash({ onEvent }: { readonly onEvent: (event: RunEvent) => void }) {
  useEffect(() => {
    onEvent({ type: 'error', error: null });
  }, [onEvent]);
  return null;
}

export function BenchApp({ config }: { readonly config: BenchConfig }) {
  const [locale, setLocale] = useState<Locale>(config.locale);
  const [state, dispatch] = useReducer(reduceRun, undefined, initialRunState);
  const t = benchTranslator(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t('bench.documentTitle', { model: MODEL.title });
  }, [locale, t]);

  const changeLocale = (next: Locale) => {
    setLocale(next);
    window.history.replaceState(null, '', configSearch({ ...config, locale: next }));
  };

  const link = (changes: Partial<BenchConfig>) => configSearch({ ...config, locale, ...changes });
  const onOff = (value: boolean) => t(value ? 'bench.on' : 'bench.off');
  const problem = problemTitle(t, state);
  const sceneLabel = t('bench.scene', {
    copies: formatInteger(locale, config.copies),
    model: t(`bench.variant.${config.model}`),
    instancing: onOff(config.instancing),
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.mark} aria-hidden="true">
          <GaugeIcon size={14} />
        </span>
        <h1 className={styles.title}>{t('bench.title')}</h1>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.model}>{MODEL.title}</span>
        <Segmented
          className={styles.language}
          size="sm"
          legend={t('bench.language')}
          value={locale}
          onChange={changeLocale}
          options={LOCALES.map((value) => ({
            value,
            label: LOCALE_LABEL[value].short,
            title: LOCALE_LABEL[value].name,
          }))}
        />
      </header>

      <nav className={styles.toolbar} aria-label={t('bench.config')}>
        <OptionLinks
          label={t('bench.config.model')}
          options={VARIANT_IDS.map((model) => ({
            key: model,
            label: t(`bench.variant.${model}`),
            href: link({ model }),
            current: model === config.model,
          }))}
        />
        <OptionLinks
          label={t('bench.config.copies')}
          options={COPY_COUNTS.map((copies) => ({
            key: String(copies),
            label: formatInteger(locale, copies),
            href: link({ copies }),
            current: copies === config.copies,
          }))}
        />
        <OptionLinks
          label={t('bench.config.instancing')}
          options={[true, false].map((instancing) => ({
            key: String(instancing),
            label: onOff(instancing),
            href: link({ instancing }),
            current: instancing === config.instancing,
          }))}
        />
        <Button
          size="sm"
          className={styles.rerun}
          icon={<RotateCwIcon size={14} />}
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('bench.runAgain')}
        </Button>
      </nav>

      <main className={styles.main}>
        <div className={styles.viewport} role="img" aria-label={sceneLabel}>
          {state.status !== 'unsupported' && (
            <ErrorBoundary fallback={() => <ReportCrash onEvent={dispatch} />}>
              <BenchViewport
                config={config}
                running={state.status === 'running'}
                onEvent={dispatch}
              />
            </ErrorBoundary>
          )}
          {problem && <StateMessage title={problem} />}
          <span className={styles.chip} aria-hidden="true">
            {sceneLabel}
          </span>
        </div>

        <aside className={styles.panel} aria-label={t('bench.results')}>
          <Section title={t('bench.status')}>
            <div className={styles.statusBody}>
              {state.status === 'running' && (
                <progress
                  className={styles.progress}
                  max={PROGRESS_STEPS}
                  value={progressStep(state.progress)}
                  aria-label={t('bench.progress')}
                />
              )}
              <div role="status" className={styles.statusText}>
                <StatusContent t={t} state={state} config={config} />
              </div>
            </div>
          </Section>
          <Section title={t('bench.results')}>
            <ResultsTable
              t={t}
              locale={locale}
              config={config}
              running={state.status === 'running'}
              run={state.status === 'done' ? state.run : null}
            />
          </Section>
          <Section title={t('bench.method')}>
            <div className={styles.method}>
              <p>{t('bench.method.load', { runs: BENCH_TIMINGS.loadRuns })}</p>
              <p>
                {t('bench.method.frame', {
                  measure: BENCH_TIMINGS.measureMs / 1000,
                  warmup: BENCH_TIMINGS.warmupMs / 1000,
                })}
              </p>
            </div>
          </Section>
          <p className={styles.credit}>
            {t('bench.credit')}: <a href={MODEL.page}>{MODEL.title}</a>, {MODEL.credit}.{' '}
            <a href={MODEL.licenceUrl}>{MODEL.licence}</a>
          </p>
        </aside>
      </main>
    </div>
  );
}
