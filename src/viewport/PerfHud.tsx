import { Fragment } from 'react';
import { launchOptions } from '../config';
import { formatMegabytes, formatMilliseconds, formatRatio } from '../i18n/format';
import type { Translator } from '../i18n/translate';
import { useT } from '../i18n/useT';
import { useEditor } from '../state/store';
import { cx } from '../ui/cx';
import { usePerf, type PerfSample } from './perf';
import styles from './Viewport.module.css';

type Row = readonly [label: string, value: string];

function sampleRows(t: Translator, sample: PerfSample | null): Row[] {
  const measuring = t.t('viewport.hud.measuring');
  if (!sample) return [[t.t('viewport.hud.fps'), measuring]];
  const { frames } = sample;
  return [
    [
      t.t('viewport.hud.fps'),
      frames ? t.t('viewport.hud.fpsValue', { fps: t.integer(Math.round(frames.fps)) }) : measuring,
    ],
    [
      t.t('viewport.hud.frame'),
      frames
        ? t.t('viewport.hud.frameValue', {
            avg: formatMilliseconds(t.locale, frames.avgMs),
            p95: formatMilliseconds(t.locale, frames.p95Ms),
          })
        : measuring,
    ],
    [t.t('viewport.hud.drawCalls'), t.integer(sample.drawCalls)],
    [t.t('viewport.hud.triangles'), t.integer(sample.triangles)],
    [t.t('viewport.hud.geometries'), t.integer(sample.geometries)],
    [t.t('viewport.hud.textures'), t.integer(sample.textures)],
    [
      t.t('viewport.hud.heap'),
      sample.heapBytes === null
        ? t.t('viewport.hud.notAvailable')
        : formatMegabytes(t.locale, sample.heapBytes),
    ],
    [t.t('viewport.hud.gpu'), sample.gpu || t.t('viewport.hud.notAvailable')],
    [
      t.t('viewport.hud.canvas'),
      t.t('viewport.hud.canvasValue', {
        width: t.integer(sample.width),
        height: t.integer(sample.height),
        dpr: formatRatio(t.locale, sample.dpr),
      }),
    ],
  ];
}

export function PerfHud() {
  const t = useT();
  const sample = usePerf((state) => state.sample);
  const itemCount = useEditor((state) => state.items.length);
  const rows: Row[] = [
    ...sampleRows(t, sample),
    [
      t.t('viewport.hud.instancing'),
      launchOptions.instancing ? t.t('viewport.hud.on') : t.t('viewport.hud.off'),
    ],
    [t.t('viewport.hud.items'), t.integer(itemCount)],
  ];
  return (
    <section className={cx(styles.panel, styles.hud)} aria-label={t.t('viewport.hud.title')}>
      <h2 className={styles.hudTitle}>{t.t('viewport.hud.title')}</h2>
      <dl className={styles.hudList}>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
