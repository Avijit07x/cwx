import type { Locator, Page } from '@playwright/test';
import {
  boxOf,
  expect,
  listRow,
  openEditor,
  positionInRow,
  redoButton,
  rowPosition,
  statusBar,
  test,
  undoButton,
  viewportGroup,
  type FloorPoint,
} from '../support.ts';

interface StreamSample {
  readonly busy: boolean;
  readonly chipsDisabled: boolean;
  readonly sendDisabled: boolean;
  readonly stopShown: boolean;
}

const STREAM_TIMEOUT_MS = 10_000;

function assistantPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Layout assistant' });
}

async function openAssistant(page: Page) {
  await page.getByRole('tab', { name: 'Assistant' }).click();
  const panel = assistantPanel(page);
  await expect(panel).toBeVisible();
  return {
    panel,
    log: panel.getByRole('log', { name: 'Conversation' }),
    composer: panel.locator('form'),
    input: panel.getByRole('textbox', { name: 'Message to the assistant' }),
    send: panel.getByRole('button', { name: 'Send' }),
    chips: panel.getByRole('group', { name: 'Suggestions' }).getByRole('button'),
  };
}

async function streamDuring(
  page: Page,
  log: Locator,
  composer: Locator,
  action: () => Promise<void>,
): Promise<readonly StreamSample[]> {
  const [logElement, formElement] = await Promise.all([
    log.elementHandle(),
    composer.elementHandle(),
  ]);
  const watcher = await page.evaluateHandle(
    ({ logElement, formElement, timeoutMs }) => {
      const samples: StreamSample[] = [];
      const take = (): StreamSample => {
        const buttons = [...formElement.querySelectorAll('button')];
        const chips = buttons.filter((button) => button.closest('[role="group"]') !== null);
        const others = buttons.filter((button) => !chips.includes(button));
        return {
          busy: logElement.getAttribute('aria-busy') === 'true',
          chipsDisabled: chips.length > 0 && chips.every((chip) => chip.disabled),
          sendDisabled: others.some((button) => button.type === 'submit' && button.disabled),
          stopShown: others.some((button) => button.type === 'button'),
        };
      };
      return {
        finished: new Promise<StreamSample[]>((resolve) => {
          const observer = new MutationObserver(() => {
            const sample = take();
            samples.push(sample);
            if (!sample.busy && samples.some((earlier) => earlier.busy)) {
              observer.disconnect();
              resolve(samples);
            }
          });
          const options = { attributes: true, childList: true, characterData: true, subtree: true };
          observer.observe(logElement, options);
          observer.observe(formElement, options);
          setTimeout(() => {
            observer.disconnect();
            resolve(samples);
          }, timeoutMs);
        }),
      };
    },
    { logElement, formElement, timeoutMs: STREAM_TIMEOUT_MS },
  );
  await action();
  return watcher.evaluate((handle) => handle.finished);
}

function expectLockedWhileStreaming(samples: readonly StreamSample[], minimumUpdates = 1) {
  const streaming = samples.filter((sample) => sample.busy);
  expect(streaming.length, 'updates observed while the reply streamed').toBeGreaterThanOrEqual(
    minimumUpdates,
  );
  expect(
    streaming.filter(
      (sample) => !(sample.chipsDisabled && sample.sendDisabled && sample.stopShown),
    ),
    'suggestion chips and Send are disabled, and Stop is shown, at every streamed update',
  ).toEqual([]);
  expect(samples.at(-1)?.busy, 'the reply finished streaming').toBe(false);
}

function proposedPosition(move: string, from: FloorPoint): FloorPoint {
  const axis = (name: 'X' | 'Z', fallback: number) => {
    const match = new RegExp(`${name} (\\d+\\.\\d+) m → (\\d+\\.\\d+) m`).exec(move);
    return match ? Number(match[2]) : fallback;
  };
  return { x: axis('X', from.x), z: axis('Z', from.z) };
}

test('Fix clearance issues streams a reply and a proposal, Accept moves the item and one undo restores it', async ({
  page,
}) => {
  await openEditor(page);
  await expect(statusBar(page)).toContainText('1 clearance issue');
  const ups = listRow(page, 'UPS-01');
  const before = await positionInRow(ups);
  const { panel, log, composer, input, send, chips } = await openAssistant(page);
  await input.fill('a draft that stays unsent');
  await expect(send).toBeEnabled();

  const samples = await streamDuring(page, log, composer, async () => {
    await panel.getByRole('button', { name: 'Fix clearance issues' }).click();
  });
  expectLockedWhileStreaming(samples, 5);
  await expect(send, 'Send comes back once the reply is complete').toBeEnabled();
  for (const chip of await chips.all()) await expect(chip).toBeEnabled();
  await expect(log).toContainText('I found 1 clearance issue.');
  await expect(log).toContainText(
    'Check the preview in the 3D view, then accept or reject it below.',
  );

  const proposal = panel.getByRole('group', { name: 'Proposed change' });
  await expect(proposal).toContainText('1 move');
  await expect(proposal).toContainText('1 → 0');
  await expect(proposal).toContainText('Previewed as violet ghosts in the 3D view.');
  const move = proposal.getByRole('listitem').filter({ hasText: 'UPS-01' });
  await expect(move).toHaveCount(1);
  const target = proposedPosition(await move.innerText(), before);
  expect(target, 'the proposal moves UPS-01').not.toEqual(before);
  await expect(ups, 'a proposal is only a preview').toContainText(rowPosition(before));

  await proposal.getByRole('button', { name: 'Accept' }).click();
  await expect(proposal).toContainText('Applied');
  await expect(log).toContainText('Done: 1 item moved in one step.');
  await expect(ups).toContainText(rowPosition(target));
  await expect(statusBar(page)).toContainText('No issues');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Assistant change (1 move)');

  await undoButton(page).click();
  await expect(ups).toContainText(rowPosition(before));
  await expect(statusBar(page)).toContainText('1 clearance issue');
  await expect(undoButton(page), 'the accepted proposal was one undo step').toBeDisabled();
  await expect(redoButton(page)).toHaveAccessibleName('Redo: Assistant change (1 move)');
});

test('at 1920 x 1080 the page never scrolls, however many prompts are sent (regression)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openEditor(page);
  const { panel, log, composer, input } = await openAssistant(page);
  const banner = page.getByRole('banner');
  const prompts: readonly { readonly chip?: string; readonly text?: string }[] = [
    { chip: 'Fix clearance issues' },
    { chip: 'Summarise the layout' },
    { chip: 'How many drives?' },
    { text: 'How many cabinets and transformers?' },
    { text: 'First line\nSecond line\nThird line, which asks for a summary' },
    { text: 'Please give me an overview of the layout' },
    { chip: 'Fix clearance issues' },
    { text: 'hello' },
    { text: 'count the UPS units' },
    { chip: 'Summarise the layout' },
  ];

  for (const [index, prompt] of prompts.entries()) {
    const samples = await streamDuring(page, log, composer, async () => {
      if (prompt.chip !== undefined) {
        await panel.getByRole('button', { name: prompt.chip }).click();
      } else {
        await input.fill(prompt.text ?? '');
        await input.press('Enter');
      }
    });
    expectLockedWhileStreaming(samples);
    await expect(log.getByText(/^You:/)).toHaveCount(index + 1);
    const geometry = await page.evaluate(() => ({
      scrollHeight: document.scrollingElement?.scrollHeight,
      scrollWidth: document.scrollingElement?.scrollWidth,
      scrollTop: document.scrollingElement?.scrollTop,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
    }));
    expect(geometry, `the page itself does not scroll after prompt ${index + 1}`).toEqual({
      scrollHeight: 1080,
      scrollWidth: 1920,
      scrollTop: 0,
      innerHeight: 1080,
      innerWidth: 1920,
    });
    expect((await boxOf(banner)).y, `the top bar stays at the top after prompt ${index + 1}`).toBe(
      0,
    );
  }

  const status = await boxOf(statusBar(page));
  expect(status.y + status.height, 'the status bar stays at the bottom').toBe(1080);
  const scroll = await log.evaluate((element) => ({
    overflows: element.scrollHeight > element.clientHeight,
    distanceFromBottom: element.scrollHeight - element.clientHeight - element.scrollTop,
  }));
  expect(scroll.overflows, 'the conversation scrolls inside its own box').toBe(true);
  expect(scroll.distanceFromBottom, 'the conversation shows its latest reply').toBeLessThanOrEqual(
    2,
  );
});

test('Reject leaves the layout alone, and a proposal made stale by an edit offers Ask again instead of Accept', async ({
  page,
}) => {
  await openEditor(page);
  const ups = listRow(page, 'UPS-01');
  const before = await positionInRow(ups);
  const { panel, log, composer } = await openAssistant(page);
  const proposals = panel.getByRole('group', { name: 'Proposed change' });
  const askForFix = async () => {
    await panel.getByRole('button', { name: 'Fix clearance issues' }).click();
  };

  expectLockedWhileStreaming(await streamDuring(page, log, composer, askForFix));
  await proposals.nth(0).getByRole('button', { name: 'Reject' }).click();
  await expect(proposals.nth(0)).toContainText('Rejected');
  await expect(ups).toContainText(rowPosition(before));
  await expect(undoButton(page), 'rejecting changes nothing').toBeDisabled();

  expectLockedWhileStreaming(await streamDuring(page, log, composer, askForFix));
  const stale = proposals.nth(1);
  await expect(stale.getByRole('button', { name: 'Accept' })).toBeEnabled();
  await ups.click();
  await viewportGroup(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(ups).toContainText(rowPosition({ x: before.x, z: before.z + 0.5 }));
  await expect(stale).toContainText(
    'The layout changed since this proposal was made, so it can no longer be applied.',
  );
  await expect(stale.getByRole('button', { name: 'Accept' })).toBeDisabled();

  expectLockedWhileStreaming(
    await streamDuring(page, log, composer, async () => {
      await stale.getByRole('button', { name: 'Ask again' }).click();
    }),
  );
  const fresh = proposals.nth(2);
  await fresh.getByRole('button', { name: 'Accept' }).click();
  await expect(fresh).toContainText('Applied');
  await expect(statusBar(page)).toContainText('No issues');
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Assistant change (1 move)');
  await undoButton(page).click();
  await expect(ups).toContainText(rowPosition({ x: before.x, z: before.z + 0.5 }));
  await expect(undoButton(page)).toHaveAccessibleName('Undo: Move UPS-01');
});
