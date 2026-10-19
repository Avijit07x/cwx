import { useId, useState } from 'react';
import { useT } from '../../i18n/useT';
import { readStorage, storageKey, writeStorage } from '../../state/persistence';
import { useBom } from '../../state/selectors';
import { IconButton } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { EmptyState } from '../../ui/EmptyState';
import { ChevronDownIcon, ChevronUpIcon, KindIcon, ListIcon } from '../../ui/icons';
import { Section } from '../../ui/Section';
import styles from './BomPanel.module.css';

const BOM_COLLAPSED_KEY = storageKey('bom-collapsed');

function readCollapsed(): boolean {
  return readStorage(BOM_COLLAPSED_KEY) === 'true';
}

export function BomPanel() {
  const t = useT();
  const bom = useBom();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const contentId = useId();
  const captionId = `${contentId}-caption`;
  const numeric = cx(styles.numeric, 'num');

  const toggle = () => {
    setCollapsed(!collapsed);
    writeStorage(BOM_COLLAPSED_KEY, String(!collapsed));
  };

  return (
    <Section
      title={t.t('bom.title')}
      meta={t.t('bom.summary', {
        items: t.plural('bom.items', bom.totalQuantity),
        total: t.usd(bom.totalUsd),
      })}
      actions={
        <IconButton
          label={t.t('bom.toggle')}
          icon={collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          size="sm"
          tooltip="top"
          onClick={toggle}
        />
      }
      className={styles.dock}
      bodyClassName={styles.body}
    >
      <div id={contentId} hidden={collapsed} className={styles.content}>
        {bom.lines.length === 0 ? (
          <EmptyState
            icon={<ListIcon size={20} />}
            title={t.t('bom.empty')}
            className={styles.empty}
          >
            {t.t('bom.emptyHint')}
          </EmptyState>
        ) : (
          <div role="region" tabIndex={0} aria-labelledby={captionId} className={styles.scroller}>
            <table className={styles.table}>
              <caption id={captionId} className="sr-only">
                {t.t('bom.caption')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t.t('bom.colItem')}</th>
                  <th scope="col" className={styles.fill}>
                    {t.t('bom.colPart')}
                  </th>
                  <th scope="col" className={cx(styles.numeric, styles.unitPrice)}>
                    {t.t('bom.colUnit')}
                  </th>
                  <th scope="col" className={styles.numeric}>
                    {t.t('bom.colQty')}
                  </th>
                  <th scope="col" className={styles.numeric}>
                    {t.t('bom.colTotal')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bom.lines.map((line) => (
                  <tr key={line.kind}>
                    <th scope="row">
                      <span className={styles.item}>
                        <KindIcon
                          kind={line.kind}
                          style={{ color: `var(--color-kind-${line.kind})` }}
                        />
                        {t.kindName(line.kind)}
                      </span>
                    </th>
                    <td className="mono">{line.partNumber}</td>
                    <td className={cx(numeric, styles.unitPrice)}>{t.usd(line.unitPriceUsd)}</td>
                    <td className={numeric}>{t.integer(line.quantity)}</td>
                    <td className={numeric}>{t.usd(line.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    {t.t('bom.total')}
                  </th>
                  <td className={numeric}>{t.integer(bom.totalQuantity)}</td>
                  <td className={numeric}>{t.usd(bom.totalUsd)}</td>
                </tr>
              </tfoot>
            </table>
            <p className={styles.note}>{t.t('bom.note')}</p>
          </div>
        )}
      </div>
    </Section>
  );
}
