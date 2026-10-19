import type { ReactNode } from 'react';
import { formatDecimal, formatInteger, formatMegabytes, formatMilliseconds } from '../i18n/format';
import type { Locale } from '../i18n/locales';
import styles from './Bench.module.css';
import type { CompletedRun } from './BenchViewport';
import type { BenchConfig } from './config';
import type { BenchTranslate } from './messages';
import { VARIANT_FILES } from './model';
import { BENCH_TIMINGS } from './protocol';

interface ResultsTableProps {
  readonly t: BenchTranslate;
  readonly locale: Locale;
  readonly config: BenchConfig;
  readonly running: boolean;
  readonly run: CompletedRun | null;
}

interface Row {
  readonly label: string;
  readonly value: ReactNode;
}

interface Group {
  readonly title: string;
  readonly rows: readonly Row[];
}

export function ResultsTable({ t, locale, config, running, run }: ResultsTableProps) {
  const unavailable = <span className={styles.muted}>{t('bench.value.unavailable')}</span>;
  const pending = running ? (
    <span className={styles.muted}>{t('bench.value.pending')}</span>
  ) : (
    unavailable
  );
  const ms = (value: number, digits?: number) => formatMilliseconds(locale, value, digits);
  const integer = (value: number) => formatInteger(locale, value);
  const measured = (format: (value: CompletedRun) => ReactNode) => (run ? format(run) : pending);

  const groups: readonly Group[] = [
    {
      title: t('bench.group.config'),
      rows: [
        {
          label: t('bench.row.file'),
          value: <span className="mono">/{VARIANT_FILES[config.model]}</span>,
        },
        {
          label: t('bench.row.size'),
          value: measured((done) =>
            t('bench.value.bytes', {
              size: formatMegabytes(locale, done.bytes, 2),
              bytes: integer(done.bytes),
            }),
          ),
        },
        { label: t('bench.row.copies'), value: integer(config.copies) },
        {
          label: t('bench.row.instancing'),
          value: t(config.instancing ? 'bench.value.instancingOn' : 'bench.value.instancingOff'),
        },
      ],
    },
    {
      title: t('bench.group.load'),
      rows: [
        {
          label: t('bench.row.loadMedian', { runs: BENCH_TIMINGS.loadRuns }),
          value: measured((done) => ms(done.loadMedianMs)),
        },
        {
          label: t('bench.row.loadRuns'),
          value: measured((done) => done.loadMs.map((value) => ms(value)).join(' · ')),
        },
      ],
    },
    {
      title: t('bench.group.frame'),
      rows: [
        { label: t('bench.row.frameAvg'), value: measured((done) => ms(done.frameAvgMs, 2)) },
        { label: t('bench.row.frameP95'), value: measured((done) => ms(done.frameP95Ms, 2)) },
        {
          label: t('bench.row.fps'),
          value: measured((done) =>
            t('bench.value.fps', { value: formatDecimal(locale, 1000 / done.frameAvgMs, 1) }),
          ),
        },
        { label: t('bench.row.cpu'), value: measured((done) => ms(done.cpuAvgMs, 2)) },
        { label: t('bench.row.frames'), value: measured((done) => integer(done.frames)) },
      ],
    },
    {
      title: t('bench.group.renderer'),
      rows: [
        { label: t('bench.row.drawCalls'), value: measured((done) => integer(done.drawCalls)) },
        { label: t('bench.row.triangles'), value: measured((done) => integer(done.triangles)) },
        {
          label: t('bench.row.resources'),
          value: measured(({ environment }) =>
            [environment.geometries, environment.textures, environment.programs]
              .map(integer)
              .join(' / '),
          ),
        },
      ],
    },
    {
      title: t('bench.group.environment'),
      rows: [
        {
          label: t('bench.row.heap'),
          value: measured(({ environment }) =>
            environment.heapBytes === null
              ? unavailable
              : formatMegabytes(locale, environment.heapBytes, 2),
          ),
        },
        {
          label: t('bench.row.gpu'),
          value: measured(({ environment }) => environment.gpu || unavailable),
        },
        {
          label: t('bench.row.canvas'),
          value: measured(({ environment }) =>
            t('bench.value.canvas', {
              width: integer(environment.cssWidth),
              height: integer(environment.cssHeight),
              bufferWidth: integer(environment.bufferWidth),
              bufferHeight: integer(environment.bufferHeight),
            }),
          ),
        },
        {
          label: t('bench.row.dpr'),
          value: measured(({ environment }) => formatDecimal(locale, environment.pixelRatio, 2)),
        },
        {
          label: t('bench.row.browser'),
          value: measured(({ environment }) => (
            <span className={styles.small}>{environment.userAgent}</span>
          )),
        },
      ],
    },
  ];

  return (
    <table className={styles.table}>
      <caption className="sr-only">{t('bench.results')}</caption>
      {groups.map((group) => (
        <tbody key={group.title}>
          <tr>
            <th scope="colgroup" colSpan={2} className={styles.groupTitle}>
              {group.title}
            </th>
          </tr>
          {group.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
