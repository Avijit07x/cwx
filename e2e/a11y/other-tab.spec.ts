import type { Page } from '@playwright/test';
import { expect, itemList, listRow, openEditor, paletteCard, statusBar, test } from '../support.ts';

async function openProject(page: Page): Promise<void> {
  await page.goto('/');
  await expect(listRow(page, 'CAB-01')).toBeVisible();
}

async function deleteFromList(page: Page, tag: string): Promise<void> {
  await listRow(page, tag).click();
  await page.keyboard.press('Delete');
  await expect(listRow(page, tag)).toHaveCount(0);
  await expect(statusBar(page)).toContainText('Saved');
}

test('two tabs on the same project follow each other’s saved edits instead of overwriting them', async ({
  context,
  page,
}) => {
  test.slow();
  const otherTab = await context.newPage();
  await openProject(page);
  await openProject(otherTab);

  await deleteFromList(page, 'VFD-01');
  await expect(listRow(otherTab, 'VFD-01'), 'the other tab loads the saved draft').toHaveCount(0);

  await deleteFromList(otherTab, 'VFD-02');
  await expect(listRow(page, 'VFD-02'), 'and the first tab follows back').toHaveCount(0);

  await page.reload();
  await expect(listRow(page, 'CAB-01')).toBeVisible();
  await expect(listRow(page, 'VFD-01')).toHaveCount(0);
  await expect(listRow(page, 'VFD-02')).toHaveCount(0);
});

test('when a saved edit from another tab replaces the layout, the editor tells the user instead of silently resetting it', async ({
  context,
  page,
}) => {
  await openEditor(page);
  const otherTab = await context.newPage();
  await openEditor(otherTab);
  const live = page.getByTestId('live-region');

  await itemList(page)
    .getByRole('option', { name: /^CAB-02 / })
    .click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Undo: Move CAB-02' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('Saved');
  await paletteCard(page, 'Cabinet').click();
  await expect(paletteCard(page, 'Cabinet')).toHaveAttribute('aria-pressed', 'true');
  const before = await live.innerText();

  await itemList(otherTab)
    .getByRole('option', { name: /^VFD-01 / })
    .click();
  await otherTab.keyboard.press('Delete');
  await expect(otherTab.getByRole('contentinfo')).toContainText('Saved');
  await expect(itemList(page).getByRole('option', { name: /^VFD-01 / })).toHaveCount(0);

  const undo = page.getByRole('banner').getByRole('button', { name: /^Undo/ });
  test.info().annotations.push({
    type: 'first tab after the other tab saved',
    description: `undo "${(await undo.getAttribute('aria-label')) ?? ''}", Cabinet pressed ${(await paletteCard(page, 'Cabinet').getAttribute('aria-pressed')) ?? ''}, live region "${await live.innerText()}"`,
  });
  await expect(
    live,
    'the reset of selection, undo history and placement is announced',
  ).not.toHaveText(before);
});
