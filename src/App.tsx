import { lazy, Suspense, useEffect } from 'react';
import styles from './App.module.css';
import { EmbedOverlay } from './embed/EmbedOverlay';
import { BomPanel } from './features/bom/BomPanel';
import { ItemList } from './features/item-list/ItemList';
import { Palette } from './features/palette/Palette';
import { PropertiesPanel } from './features/properties/PropertiesPanel';
import { RuleCheckPanel } from './features/rule-check/RuleCheckPanel';
import { useShortcutStore } from './features/shortcuts/shortcutStore';
import { useKeyboardShortcuts } from './features/shortcuts/useKeyboardShortcuts';
import { StatusBar } from './features/status-bar/StatusBar';
import { TopBar } from './features/toolbar/TopBar';
import { useT } from './i18n/useT';
import { ALERT_TOASTER_ID, setInspectorTab } from './state/actions';
import { useEditor, type InspectorTab } from './state/store';
import { Button } from './ui/Button';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { LiveRegion } from './ui/LiveRegion';
import { StateMessage } from './ui/StateMessage';
import { TabPanel, Tabs } from './ui/Tabs';
import { Toaster } from './ui/Toaster';
import { TooltipProvider } from './ui/Tooltip';

const Viewport = lazy(() => import('./viewport/Viewport'));
const AssistantTab = lazy(() => import('./AssistantTab'));

function ReloadMessage({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body?: string;
  readonly action: string;
}) {
  return (
    <StateMessage
      role="alert"
      title={title}
      body={body}
      action={
        <Button
          size="sm"
          onClick={() => {
            window.location.reload();
          }}
        >
          {action}
        </Button>
      }
    />
  );
}

function ViewportError() {
  const t = useT();
  return (
    <ReloadMessage
      title={t.t('app.viewportError')}
      body={t.t('app.viewportErrorHint')}
      action={t.t('app.retry')}
    />
  );
}

function AssistantError() {
  const t = useT();
  return <ReloadMessage title={t.t('app.assistantError')} action={t.t('app.retry')} />;
}

export function AppCrashed() {
  const t = useT();
  return (
    <ReloadMessage
      title={t.t('app.crashed')}
      body={t.t('app.crashedHint')}
      action={t.t('app.reload')}
    />
  );
}

function Announcer() {
  const announcement = useEditor((state) => state.announcement);
  return <LiveRegion announcement={announcement} />;
}

export function App() {
  const t = useT();
  const inspectorTab = useEditor((state) => state.inspectorTab);
  const embedded = useEditor((state) => state.session.embedded);
  const singleKeys = useShortcutStore((state) => state.singleKeys);

  useKeyboardShortcuts();

  useEffect(() => {
    document.documentElement.lang = t.locale;
    document.title = t.t('app.name');
  }, [t]);

  const tabs: readonly { id: InspectorTab; label: string }[] = [
    { id: 'inspect', label: t.t('app.inspectTab') },
    { id: 'assistant', label: t.t('app.assistantTab') },
  ];

  return (
    <TooltipProvider>
      <div className={styles.app}>
        <div className={styles.top}>
          <TopBar />
        </div>
        <aside className={styles.sidebar} aria-label={t.t('app.sidebar')}>
          <Palette />
          <div className={styles.itemList}>
            <ItemList />
          </div>
        </aside>
        <main className={styles.workspace} aria-label={t.t('app.workspace')}>
          <div className={styles.viewport}>
            <ErrorBoundary fallback={() => <ViewportError />}>
              <Suspense
                fallback={
                  <StateMessage role="status" warning={false} title={t.t('app.viewportLoading')} />
                }
              >
                <Viewport singleKeys={singleKeys} />
              </Suspense>
            </ErrorBoundary>
          </div>
          <BomPanel />
        </main>
        <aside className={styles.inspector} aria-label={t.t('app.inspector')}>
          <Tabs
            label={t.t('app.inspector')}
            tabs={tabs}
            value={inspectorTab}
            onChange={setInspectorTab}
            className={styles.inspectorTabs}
          >
            <TabPanel value="inspect" className={styles.inspectPanel}>
              <PropertiesPanel />
              <RuleCheckPanel />
            </TabPanel>
            <TabPanel value="assistant" className={styles.assistantPanel}>
              <ErrorBoundary fallback={() => <AssistantError />}>
                <Suspense>
                  <AssistantTab />
                </Suspense>
              </ErrorBoundary>
            </TabPanel>
          </Tabs>
          {embedded && <EmbedOverlay />}
        </aside>
        <div className={styles.status}>
          <StatusBar />
        </div>
        <Toaster
          alertId={ALERT_TOASTER_ID}
          labels={{
            notifications: t.t('ui.notifications'),
            errorNotifications: t.t('ui.errorNotifications'),
            dismiss: t.t('common.dismiss'),
          }}
        />
        <Announcer />
      </div>
    </TooltipProvider>
  );
}
