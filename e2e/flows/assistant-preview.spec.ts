import type { Locator, Page } from '@playwright/test';
import {
  expect,
  hudNumber,
  listRow,
  openEditor,
  positionInRow,
  propertiesPanel,
  redoButton,
  rowPosition,
  seriousAxeViolations,
  statusBar,
  switchToTopView,
  test,
  undoButton,
  type FloorPoint,
} from '../support.ts';

function assistantPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Layout assistant' });
}

function proposals(page: Page): Locator {
  return assistantPanel(page).getByRole('group', { name: 'Proposed change' });
}

async function askForFix(page: Page): Promise<Locator> {
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  const panel = assistantPanel(page);
  const before = await proposals(page).count();
  await panel.getByRole('button', { name: 'Fix clearance issues' }).click();
  await expect(proposals(page)).toHaveCount(before + 1);
  await expect(panel.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  return proposals(page).nth(before);
}

async function issueCount(page: Page): Promise<number> {
  const text = await statusBar(page).innerText();
  if (text.includes('No issues')) return 0;
  const match = /(\d+) clearance issues?/.exec(text);
  if (!match) throw new Error(`The status bar shows no issue count: ${text}`);
  return Number(match[1]);
}

async function promisedCounts(card: Locator): Promise<{ before: number; after: number }> {
  const match = /Clearance issues\s*(\d+) → (\d+)/.exec(await card.innerText());
  if (!match) throw new Error('The proposal card shows no issue counts');
  return { before: Number(match[1]), after: Number(match[2]) };
}

async function moveCount(card: Locator): Promise<number> {
  const match = /(\d+) moves?/.exec(await card.innerText());
  if (!match) throw new Error('The proposal card shows no move count');
  return Number(match[1]);
}

function targetOf(moveText: string, from: FloorPoint): FloorPoint {
  const axis = (name: 'X' | 'Z', fallback: number) => {
    const match = new RegExp(`${name} (\\d+\\.\\d+) m → (\\d+\\.\\d+) m`).exec(moveText);
    return match ? Number(match[2]) : fallback;
  };
  return { x: axis('X', from.x), z: axis('Z', from.z) };
}

async function moveWithFields(page: Page, tag: string, to: FloorPoint): Promise<void> {
  await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await listRow(page, tag).click();
  const properties = propertiesPanel(page);
  for (const [axis, value] of [
    ['X', to.x],
    ['Z', to.z],
  ] as const) {
    const field = properties.getByRole('textbox', { name: axis, exact: true });
    await field.fill(value.toFixed(2));
    await field.press('Enter');
  }
  await expect(listRow(page, tag)).toContainText(rowPosition(to));
}

async function pixelAt(page: Page, at: { x: number; y: number }): Promise<number[]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, x, y }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) return [];
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
    },
    { png, x: at.x, y: at.y },
  );
}

function isViolet([red = 0, green = 0, blue = 0]: readonly number[]): boolean {
  return blue - green > 40 && blue - red > 20;
}

test('the preview adds one ghost draw call per move plus one line set, Reject removes it, and Accept leaves no overlay', async ({
  page,
}) => {
  await openEditor(page, '/?perf=1');
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10);

  const first = await askForFix(page);
  const moves = await moveCount(first);
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10 + moves + 1);
  await first.getByRole('button', { name: 'Reject' }).click();
  await expect(first).toContainText('Rejected');
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10);

  const second = await askForFix(page);
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10 + moves + 1);
  await second.getByRole('button', { name: 'Accept' }).click();
  await expect(statusBar(page)).toContainText('No issues');
  await expect
    .poll(() => hudNumber(page, 'Draw calls'), {
      message: 'no ghosts and no violation overlays are left: 4 room + 4 item kinds',
    })
    .toBe(8);
});

test('a twelve-move proposal is one undo step, redo re-applies it, and the issue count after Accept is the one the card promised', async ({
  page,
}) => {
  await openEditor(page, '/?seed=60');
  const card = await askForFix(page);
  const { before, after } = await promisedCounts(card);
  const moves = await moveCount(card);
  expect(moves, 'the proposal is capped at 12 moves').toBe(12);
  expect(await issueCount(page)).toBe(before);
  await expect(assistantPanel(page).getByRole('log')).toContainText(
    `Moving ${String(moves)} items to the nearest free spots brings them down to ${String(after)};`,
  );

  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(card).toContainText('Applied');
  await expect
    .poll(() => issueCount(page), { message: 'the card promised this count' })
    .toBe(after);
  await expect(undoButton(page)).toHaveAccessibleName(`Undo: Assistant change (${moves} moves)`);

  await undoButton(page).click();
  await expect.poll(() => issueCount(page)).toBe(before);
  await expect(redoButton(page)).toHaveAccessibleName(`Redo: Assistant change (${moves} moves)`);
  await expect(undoButton(page), 'one undo step took back every move').toBeDisabled();

  await redoButton(page).click();
  await expect.poll(() => issueCount(page)).toBe(after);
});

test('Accept from the keyboard applies the change and keeps focus on the card', async ({
  page,
}) => {
  await openEditor(page);
  const card = await askForFix(page);
  const accept = card.getByRole('button', { name: 'Accept' });
  await accept.focus();
  await page.keyboard.press('Enter');
  await expect(card).toContainText('Applied');
  await expect(card, 'focus moves to the card instead of being lost').toBeFocused();
  await expect(statusBar(page)).toContainText('No issues');
});

test('deleting a proposed item makes the proposal stale, so it can no longer be accepted', async ({
  page,
}) => {
  await openEditor(page);
  const card = await askForFix(page);
  await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await listRow(page, 'UPS-01').click();
  await page.keyboard.press('Delete');
  await expect(listRow(page, 'UPS-01')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  await expect(card).toContainText('The layout changed since this proposal was made');
  await expect(card.getByRole('button', { name: 'Accept' })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Ask again' })).toBeEnabled();
  expect(await seriousAxeViolations(page), 'the stale card passes axe WCAG 2.2 AA').toEqual([]);
});

test('a newer proposal replaces the preview, and the older card says it is no longer previewed', async ({
  page,
}) => {
  await openEditor(page);
  const older = await askForFix(page);
  const newer = await askForFix(page);
  await expect(older).toContainText('No longer previewed');
  await expect(older.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(newer.getByRole('button', { name: 'Accept' })).toBeEnabled();
});

test('when another item has taken the proposed spot, the card must not promise a clear layout that Accept then breaks', async ({
  page,
}) => {
  await openEditor(page);
  const ups = listRow(page, 'UPS-01');
  const from = await positionInRow(ups);
  const card = await askForFix(page);
  const move = card.getByRole('listitem').filter({ hasText: 'UPS-01' });
  const target = targetOf(await move.innerText(), from);
  const promised = await promisedCounts(card);
  expect(promised).toEqual({ before: 1, after: 0 });

  await moveWithFields(page, 'UPS-02', target);
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  const accept = card.getByRole('button', { name: 'Accept' });
  const stillOffered = await accept.isEnabled();
  const shownCounts = await promisedCounts(card);
  test.info().annotations.push({
    type: 'state before Accept',
    description: `status bar ${String(await issueCount(page))} issues; card ${String(shownCounts.before)} → ${String(shownCounts.after)}; Accept enabled: ${String(stillOffered)}`,
  });
  if (!stillOffered) {
    await expect(card).toContainText('The layout changed since this proposal was made');
    return;
  }

  await accept.click();
  await expect(card).toContainText('Applied');
  await expect(
    statusBar(page),
    `the card said ${String(shownCounts.after)} issues would remain after Accept`,
  ).toContainText(shownCounts.after === 0 ? 'No issues' : `${String(shownCounts.after)} clearance`);
});

test('a proposal whose target another item now takes can no longer be accepted', async ({
  page,
}) => {
  await page.goto('/');
  const ups = listRow(page, 'UPS-01');
  const before = await positionInRow(ups);
  const card = await askForFix(page);
  const accept = card.getByRole('button', { name: 'Accept' });
  await expect(accept).toBeEnabled();
  const target = targetOf(
    await card.getByRole('listitem').filter({ hasText: 'UPS-01' }).innerText(),
    before,
  );

  await moveWithFields(page, 'UPS-02', target);
  await expect(ups, 'the proposal is still only a preview').toContainText(rowPosition(before));

  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  await expect(card).toContainText('The layout changed since this proposal was made');
  await expect(accept).toBeDisabled();
});

test('stopping a fix before its proposal arrives previews nothing and leaves nothing to accept', async ({
  page,
}) => {
  await openEditor(page, '/?perf=1');
  await expect.poll(() => hudNumber(page, 'Draw calls')).toBe(10);
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  const panel = assistantPanel(page);
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await panel.getByRole('button', { name: 'Fix clearance issues' }).click();
  await page.clock.runFor(80);
  await panel.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.clock.runFor(2000);
  await page.clock.resume();
  await expect(panel.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  await expect(panel.getByRole('log')).toContainText('Stopped');
  await expect(proposals(page)).toHaveCount(0);
  await expect
    .poll(() => hudNumber(page, 'Draw calls'), { message: 'no ghosts were drawn' })
    .toBe(10);
});

test('the violet ghost appears at the proposed spot in the 3D view and goes away on Reject', async ({
  page,
}) => {
  const canvas = await openEditor(page);
  const toScreen = await switchToTopView(page, canvas);
  const ups = listRow(page, 'UPS-01');
  const from = await positionInRow(ups);
  await page.mouse.move(0, 0);
  const card = await askForFix(page);
  const target = targetOf(
    await card.getByRole('listitem').filter({ hasText: 'UPS-01' }).innerText(),
    from,
  );
  const spot = toScreen(target, 1.6);
  await expect
    .poll(async () => isViolet(await pixelAt(page, spot)), {
      message: `a violet ghost covers X ${String(target.x)} Z ${String(target.z)}`,
    })
    .toBe(true);
  await card.getByRole('button', { name: 'Reject' }).click();
  await expect.poll(async () => isViolet(await pixelAt(page, spot))).toBe(false);
});

test('after an unrelated edit adds a clearance issue, the card’s issue count follows the layout it would produce', async ({
  page,
}) => {
  await openEditor(page);
  const card = await askForFix(page);
  expect(await promisedCounts(card)).toEqual({ before: 1, after: 0 });
  await moveWithFields(page, 'CAB-01', { x: 4, z: 1.25 });
  expect(await issueCount(page), 'CAB-01 now touches CAB-02').toBe(2);
  await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
  const shown = await promisedCounts(card);
  test.info().annotations.push({
    type: 'card after the unrelated edit',
    description: `card ${String(shown.before)} → ${String(shown.after)}; status bar ${String(await issueCount(page))} issues`,
  });
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(card).toContainText('Applied');
  await expect
    .poll(() => issueCount(page), {
      message: `the card said ${String(shown.after)} issues would remain after Accept`,
    })
    .toBe(shown.after);
});
