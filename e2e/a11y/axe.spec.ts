import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import {
  EDITOR_STATES,
  expect,
  openEditor,
  openHost,
  test,
  waitForView,
  WCAG_22_AA,
} from '../support.ts';

const BLOCKING_IMPACTS: readonly string[] = ['serious', 'critical'];

async function expectNoSeriousViolations(page: Page, testInfo: TestInfo): Promise<void> {
  const { violations, incomplete } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  await testInfo.attach('axe-results.json', {
    body: JSON.stringify({ violations, incomplete }, null, 2),
    contentType: 'application/json',
  });
  const findings = [
    ...violations.map((result) => ({ kind: 'violation', result })),
    ...incomplete.map((result) => ({ kind: 'needs review', result })),
  ];
  for (const { kind, result } of findings) {
    const targets = result.nodes.map(({ target }) => target.join(' >> ')).join(', ');
    console.log(`axe ${kind} ${result.impact ?? 'unrated'} ${result.id}: ${targets}`);
  }
  const blocking = violations
    .filter(({ impact }) => BLOCKING_IMPACTS.includes(impact ?? ''))
    .flatMap(({ id, impact, nodes }) =>
      nodes.map(({ target }) => `${impact ?? ''} ${id}: ${target.join(' >> ')}`),
    );
  expect(blocking).toEqual([]);
}

for (const state of EDITOR_STATES) {
  test(`axe finds no serious or critical WCAG 2.2 AA violations in the editor: ${state.name}`, async ({
    page,
  }, testInfo) => {
    await openEditor(page);
    await state.enter(page);
    await expectNoSeriousViolations(page, testInfo);
  });
}

test('axe finds no serious or critical WCAG 2.2 AA violations on host.html with the editor embedded', async ({
  page,
}, testInfo) => {
  const editor = await openHost(page);
  await expect(page.locator('#bom-content')).toBeVisible();
  await waitForView(editor);
  await expectNoSeriousViolations(page, testInfo);
});

test('axe finds no serious or critical WCAG 2.2 AA violations on bench.html after a run', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/bench.html');
  await expect(page.getByRole('heading', { level: 1, name: 'Model benchmark' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible({
    timeout: 150_000,
  });
  await expectNoSeriousViolations(page, testInfo);
});
