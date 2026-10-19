import type { FrameLocator, JSHandle, Locator, Page } from '@playwright/test';
import { expect, openHost, test, waitForView } from './support.ts';

const LOCALE_KEY = 'layout-editor:v1:locale';
const TOLERANCE_PX = 0.5;
const REPLY_TIMEOUT_MS = 15_000;

const SURFACES = ['editor', 'embedded'] as const;
const WIDTHS = [1920, 900] as const;
const LOCALES = ['en', 'vi'] as const;

type Surface = (typeof SURFACES)[number];
type Locale = (typeof LOCALES)[number];

const WORDS: Readonly<
  Record<
    Locale,
    {
      readonly tab: string;
      readonly fix: string;
      readonly summary: string;
      readonly replyStart: string;
      readonly stop: string;
      readonly stopped: string;
      readonly proposal: string;
    }
  >
> = {
  en: {
    tab: 'Assistant',
    fix: 'Fix clearance issues',
    summary: 'Summarise the layout',
    replyStart: 'The layout',
    stop: 'Stop',
    stopped: 'Stopped',
    proposal: 'Proposed change',
  },
  vi: {
    tab: 'Trợ lý',
    fix: 'Khắc phục lỗi khoảng cách',
    summary: 'Tóm tắt bố trí',
    replyStart: 'Bố trí',
    stop: 'Dừng',
    stopped: 'Đã dừng',
    proposal: 'Thay đổi đề xuất',
  },
};

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ComposerFrame {
  readonly streaming: boolean;
  readonly parts: readonly (readonly [string, Box])[];
  readonly actions: readonly Box[];
  readonly cardTop: number | null;
  readonly focusOnBody: boolean;
}

interface ComposerWatch {
  readonly finish: () => ComposerFrame[];
}

async function openAssistant(page: Page, surface: Surface, locale: Locale): Promise<Locator> {
  let view: Page | FrameLocator;
  if (surface === 'embedded') {
    view = await openHost(page);
    if (locale !== 'en') await page.locator('#locale-select').selectOption(locale);
  } else {
    await page.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [LOCALE_KEY, locale] as const,
    );
    await page.goto('/');
    view = page;
  }
  const documentRoot = view.locator('html');
  await expect(documentRoot).toHaveAttribute('lang', locale);
  const root = documentRoot.locator('body');
  await waitForView(view);
  await root.getByRole('tab', { name: WORDS[locale].tab }).click();
  await root.locator('textarea').scrollIntoViewIfNeeded();
  await root.evaluate(async () => {
    await document.fonts.ready;
  });
  return root;
}

function watchComposer(root: Locator): Promise<JSHandle<ComposerWatch>> {
  return root.evaluateHandle((body) => {
    const log = body.querySelector('[role="log"]');
    const form = log?.closest('section')?.querySelector('form');
    const textarea = form?.querySelector('textarea');
    const hintId = textarea?.getAttribute('aria-describedby');
    const hint = hintId ? document.getElementById(hintId) : null;
    const footer = hint?.parentElement;
    const suggestions = form?.querySelector('[role="group"]');
    if (!log || !form || !textarea || !hint || !footer || !suggestions) {
      throw new Error('The assistant composer is not on the page');
    }
    const boxOf = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    };
    const frames: ComposerFrame[] = [];
    let watching = true;
    const sample = () => {
      const chips = [...suggestions.querySelectorAll('button')];
      const card = [...log.querySelectorAll('[role="group"]')].at(-1);
      frames.push({
        streaming: log.getAttribute('aria-busy') === 'true',
        parts: [
          ['composer', boxOf(form)],
          ['suggestion row', boxOf(suggestions)],
          ...chips.map((chip, index): readonly [string, Box] => [
            `suggestion ${index + 1}`,
            boxOf(chip),
          ]),
          ['message box', boxOf(textarea)],
          ['footer row', boxOf(footer)],
          ['hint', boxOf(hint)],
        ],
        actions: [...footer.querySelectorAll('button')]
          .filter((button) => button.checkVisibility({ visibilityProperty: true }))
          .map(boxOf),
        cardTop: card
          ? card.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop
          : null,
        focusOnBody: document.activeElement === null || document.activeElement === document.body,
      });
      if (watching) requestAnimationFrame(sample);
    };
    sample();
    return {
      finish: () => {
        watching = false;
        return frames;
      },
    };
  });
}

async function framesDuring(
  root: Locator,
  action: () => Promise<void>,
): Promise<readonly ComposerFrame[]> {
  const watch = await watchComposer(root);
  await action();
  await root.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  return watch.evaluate((handle) => handle.finish());
}

function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) <= TOLERANCE_PX &&
    Math.abs(a.y - b.y) <= TOLERANCE_PX &&
    Math.abs(a.width - b.width) <= TOLERANCE_PX &&
    Math.abs(a.height - b.height) <= TOLERANCE_PX
  );
}

function describeBox(box: Box): string {
  return `(${box.x.toFixed(2)}, ${box.y.toFixed(2)}) ${box.width.toFixed(2)} × ${box.height.toFixed(2)}`;
}

function changesFrom(idle: ComposerFrame, frame: ComposerFrame): string[] {
  const state = frame.streaming ? 'while streaming' : 'after the reply';
  const parts = frame.parts.flatMap(([name, box], index) => {
    const before = idle.parts[index];
    if (before?.[0] !== name) return [`${state}: ${name} is new`];
    return sameBox(before[1], box)
      ? []
      : [`${state}: ${name} ${describeBox(before[1])} → ${describeBox(box)}`];
  });
  const [slot] = idle.actions;
  const [action] = frame.actions;
  const actionStill =
    frame.actions.length === 1 &&
    slot !== undefined &&
    action !== undefined &&
    sameBox(slot, action);
  const actions = actionStill
    ? []
    : [
        `${state}: visible Send/Stop ${idle.actions.map(describeBox).join(' + ')} → ${frame.actions.map(describeBox).join(' + ')}`,
      ];
  return [...parts, ...actions];
}

function expectComposerStill(frames: readonly ComposerFrame[]): void {
  const [idle] = frames;
  if (!idle) throw new Error('No frames were sampled');
  expect(idle.streaming, 'the first frame is taken before the reply starts').toBe(false);
  expect(idle.actions, 'one Send button is visible before the reply').toHaveLength(1);
  expect(
    frames.filter((frame) => frame.streaming).length,
    'frames sampled while the reply streamed',
  ).toBeGreaterThan(2);
  expect(frames.at(-1)?.streaming, 'the reply has finished').toBe(false);
  expect(
    [...new Set(frames.flatMap((frame) => changesFrom(idle, frame)))],
    `composer parts that moved or resized by more than ${TOLERANCE_PX} px`,
  ).toEqual([]);
}

function expectCardStill(frames: readonly ComposerFrame[]): void {
  const tops = frames.flatMap((frame) => (frame.cardTop === null ? [] : [frame.cardTop]));
  const [first] = tops;
  if (first === undefined) throw new Error('The proposal card was never on screen');
  const moves = tops
    .filter((top) => Math.abs(top - first) > TOLERANCE_PX)
    .map((top) => `${first.toFixed(2)} → ${top.toFixed(2)}`);
  expect(
    [...new Set(moves)],
    `proposal card moves of more than ${TOLERANCE_PX} px inside the conversation`,
  ).toEqual([]);
}

async function doubleClick(
  page: Page,
  target: Locator,
  afterFirstClick: () => Promise<void>,
): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('The control to double-click is not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ clickCount: 1 });
  await page.mouse.up({ clickCount: 1 });
  await afterFirstClick();
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.up({ clickCount: 2 });
}

for (const surface of SURFACES) {
  for (const width of WIDTHS) {
    for (const locale of LOCALES) {
      test.describe(`${surface} at ${width} × 1080, ${locale}`, () => {
        test.use({ viewport: { width, height: 1080 } });
        const words = WORDS[locale];

        test('a suggestion chip streams a reply without moving or resizing the composer or the proposal card', async ({
          page,
        }) => {
          const root = await openAssistant(page, surface, locale);
          const log = root.getByRole('log');
          const frames = await framesDuring(root, async () => {
            await root.getByRole('button', { name: words.fix, exact: true }).click();
            await expect(log).toHaveAttribute('aria-busy', 'true');
            await expect(log).toHaveAttribute('aria-busy', 'false', { timeout: REPLY_TIMEOUT_MS });
          });
          expectComposerStill(frames);
          expectCardStill(frames);
          await expect(root.getByRole('group', { name: words.proposal })).toBeVisible();
        });

        test('stopping a reply mid-stream does not move or resize the composer', async ({
          page,
        }) => {
          const root = await openAssistant(page, surface, locale);
          const log = root.getByRole('log');
          const frames = await framesDuring(root, async () => {
            await root.getByRole('button', { name: words.summary, exact: true }).click();
            await expect(log).toContainText(words.replyStart);
            await root.getByRole('button', { name: words.stop, exact: true }).click();
            await expect(log).toContainText(words.stopped);
            await expect(log).toHaveAttribute('aria-busy', 'false');
          });
          expectComposerStill(frames);
        });
      });
    }
  }
}

test('a keyboard user keeps focus in the composer while Send turns into Stop and back', async ({
  page,
}) => {
  const root = await openAssistant(page, 'editor', 'en');
  const log = root.getByRole('log');
  const input = root.getByRole('textbox', { name: 'Message to the assistant' });
  const frames = await framesDuring(root, async () => {
    await input.fill('Summarise the layout');
    await input.press('Tab');
    await expect(root.getByRole('button', { name: 'Send' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(log).toHaveAttribute('aria-busy', 'true');
    await expect(
      input,
      'sending from the Send button leaves focus in the message box',
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root.getByRole('button', { name: 'Stop' }), 'Tab reaches Stop').toBeFocused();
    await expect(log).toHaveAttribute('aria-busy', 'false', { timeout: REPLY_TIMEOUT_MS });
    await expect(
      input,
      'focus returns to the message box when Stop turns back into Send',
    ).toBeFocused();
  });
  expect(
    frames.filter((frame) => frame.focusOnBody).length,
    'frames in which focus fell to the page body',
  ).toBe(0);
  expectComposerStill(frames);
});

test('double-clicking Send sends one message and lets its reply finish', async ({ page }) => {
  const root = await openAssistant(page, 'editor', 'en');
  const log = root.getByRole('log');
  await root
    .getByRole('textbox', { name: 'Message to the assistant' })
    .fill('Summarise the layout');
  await doubleClick(page, root.getByRole('button', { name: 'Send' }), async () => {
    await expect(root.getByRole('button', { name: 'Stop' })).toBeVisible();
  });
  await expect(log).toContainText('I will propose moves.', { timeout: REPLY_TIMEOUT_MS });
  await expect(log).toHaveAttribute('aria-busy', 'false');
  await expect(log).not.toContainText('Stopped');
  await expect(log.getByText(/^You:/)).toHaveCount(1);
});

test('double-clicking Send leaves focus in the message box, not on Stop', async ({ page }) => {
  const root = await openAssistant(page, 'editor', 'en');
  const log = root.getByRole('log', { name: 'Conversation' });
  const input = root.getByRole('textbox', { name: 'Message to the assistant' });
  await input.fill('Summarise the layout');

  await doubleClick(page, root.getByRole('button', { name: 'Send' }), async () => {
    await expect(root.getByRole('button', { name: 'Stop' })).toBeVisible();
  });
  const rightAway = await input.evaluate((element) => ({
    focused: element === document.activeElement,
    streaming: document.querySelector('[role="log"]')?.getAttribute('aria-busy') === 'true',
  }));

  expect(rightAway).toEqual({ focused: true, streaming: true });
  await expect(log).toHaveAttribute('aria-busy', 'false', { timeout: REPLY_TIMEOUT_MS });
  await expect(log).not.toContainText('Stopped');
  await expect(input).toBeFocused();
});

test('double-clicking Stop stops the reply and leaves the typed draft unsent', async ({ page }) => {
  const root = await openAssistant(page, 'editor', 'en');
  const log = root.getByRole('log');
  const input = root.getByRole('textbox', { name: 'Message to the assistant' });
  await input.fill('a follow-up question');
  await root.getByRole('button', { name: 'Summarise the layout', exact: true }).click();
  await expect(log).toContainText('The layout');
  await doubleClick(page, root.getByRole('button', { name: 'Stop' }), async () => {
    await expect(root.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
  await expect(log).toContainText('Stopped');
  await expect(log).toHaveAttribute('aria-busy', 'false');
  await expect(input).toHaveValue('a follow-up question');
  await expect(log.getByText(/^You:/)).toHaveCount(1);
});

test('double-clicking Stop with a typed draft leaves focus in the message box, not on Send', async ({
  page,
}) => {
  const root = await openAssistant(page, 'editor', 'en');
  const log = root.getByRole('log', { name: 'Conversation' });
  const input = root.getByRole('textbox', { name: 'Message to the assistant' });
  await input.fill('a follow-up question');
  await root.getByRole('button', { name: 'Summarise the layout', exact: true }).click();
  await expect(log).toContainText('The layout');

  await doubleClick(page, root.getByRole('button', { name: 'Stop' }), async () => {
    await expect(root.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  await expect(log).toContainText('Stopped');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('a follow-up question');
});

test('double-clicking a suggestion chip sends once and keeps focus in the message box', async ({
  page,
}) => {
  const root = await openAssistant(page, 'editor', 'en');
  const log = root.getByRole('log');
  const input = root.getByRole('textbox', { name: 'Message to the assistant' });
  const chip = root.getByRole('button', { name: 'Summarise the layout', exact: true });
  await doubleClick(page, chip, async () => {
    await expect(chip).toBeDisabled();
  });
  await expect(input, 'the second click on the disabled chip leaves focus alone').toBeFocused();
  await expect(log).toHaveAttribute('aria-busy', 'false', { timeout: REPLY_TIMEOUT_MS });
  await expect(input).toBeFocused();
  await expect(log.getByText(/^You:/)).toHaveCount(1);
});
