import type { Locator, Page } from '@playwright/test';
import { expect, openEditor, statusBar, test, undoButton } from '../support.ts';

interface Labels {
  readonly panel: string;
  readonly tab: string;
  readonly stop: string;
}

interface Assistant {
  readonly log: Locator;
  readonly input: Locator;
  readonly send: Locator;
  readonly stop: Locator;
  readonly chip: (name: string) => Locator;
}

const ENGLISH: Labels = { panel: 'Layout assistant', tab: 'Assistant', stop: 'Stop' };
const VIETNAMESE: Labels = { panel: 'Trợ lý bố trí', tab: 'Trợ lý', stop: 'Dừng' };

function assistantIn(page: Page, labels: Labels): Assistant {
  const panel = page.getByRole('region', { name: labels.panel });
  return {
    log: panel.getByRole('log'),
    input: panel.getByRole('textbox'),
    send: panel.locator('button[type="submit"]'),
    stop: panel.locator('form').getByRole('button', { name: labels.stop, exact: true }),
    chip: (name) => panel.getByRole('group').getByRole('button', { name, exact: true }),
  };
}

async function openAssistant(page: Page, labels: Labels = ENGLISH) {
  await page.getByRole('tab', { name: labels.tab, exact: true }).click();
  const assistant = assistantIn(page, labels);
  await expect(assistant.log).toBeVisible();
  return assistant;
}

function lastReply(log: Locator): Locator {
  return log.locator(':scope > div').last();
}

async function ask(assistant: Assistant, prompt: string): Promise<Locator> {
  await assistant.input.fill(prompt);
  await assistant.input.press('Enter');
  await expect(assistant.log).toHaveAttribute('aria-busy', 'false');
  const reply = lastReply(assistant.log);
  await expect(reply.locator('[class*="caret"]')).toHaveCount(0);
  return reply;
}

async function bomTotal(page: Page): Promise<string> {
  const total = page
    .getByRole('region', { name: /Bill of materials|Bảng kê vật tư/ })
    .locator('tfoot td')
    .last();
  return (await total.innerText()).trim();
}

test('typed English questions are answered from the layout: counts by type, the inventory, the summary and help', async ({
  page,
}) => {
  await openEditor(page);
  const total = await bomTotal(page);
  const assistant = await openAssistant(page);

  await expect(await ask(assistant, 'How many cabinets and transformers?')).toContainText(
    'The layout has 4 cabinets and 2 transformers.',
  );
  await expect(await ask(assistant, 'count the UPS units')).toContainText(
    'The layout has 2 UPS units.',
  );
  await expect(await ask(assistant, 'How many VFDs are there?')).toContainText(
    'The layout has 4 drives.',
  );
  await expect(await ask(assistant, 'How many items are placed?')).toContainText(
    'The layout has 12 items: 4 cabinets, 4 drives, 2 transformers, and 2 UPS units.',
  );

  await assistant.chip('Summarise the layout').click();
  await expect(assistant.log).toHaveAttribute('aria-busy', 'false');
  const summary = lastReply(assistant.log);
  await expect(summary).toContainText('There is 1 clearance issue.');
  await expect(summary).toContainText('TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m).');
  await expect(summary).toContainText(`The bill of materials totals ${total}.`);

  await expect(await ask(assistant, 'hello there')).toContainText(
    'I can fix clearance issues, summarise the layout or count equipment by type.',
  );

  await assistant.input.fill('   \n  ');
  await expect(assistant.send, 'a blank message cannot be sent').toBeDisabled();
  await expect(statusBar(page)).toContainText('1 clearance issue');
  await expect(undoButton(page), 'questions never change the layout').toBeDisabled();
});

test('in Vietnamese, chips and typed questions with or without diacritics get Vietnamese answers, and the fix applies as one undo step', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  const total = await bomTotal(page);
  const assistant = await openAssistant(page, VIETNAMESE);

  await assistant.chip('Có bao nhiêu biến tần?').click();
  await expect(lastReply(assistant.log)).toContainText('Bố trí có 4 biến tần.');
  await expect(assistant.log).toHaveAttribute('aria-busy', 'false');

  await expect(await ask(assistant, 'co bao nhieu tu dien va may bien ap?')).toContainText(
    'Bố trí có 4 tủ điện và 2 máy biến áp.',
  );
  await expect(await ask(assistant, 'Số lượng bộ UPS?')).toContainText('Bố trí có 2 bộ UPS.');

  const summary = await ask(assistant, 'tom tat bo tri giup toi');
  await expect(summary).toContainText('Bố trí có 12 thiết bị');
  await expect(summary).toContainText('Có 1 lỗi khoảng cách.');
  await expect(summary).toContainText(`Tổng giá trị danh mục vật tư là ${total}.`);

  await expect(await ask(assistant, 'xin chào')).toContainText(
    'Tôi có thể khắc phục lỗi khoảng cách, tóm tắt bố trí hoặc đếm thiết bị theo loại.',
  );

  await expect(await ask(assistant, 'sua khoang cach giup toi')).toContainText(
    'Tôi tìm thấy 1 lỗi khoảng cách.',
  );
  const card = assistant.log.getByRole('group', { name: 'Thay đổi đề xuất' });
  await expect(card).toContainText('1 lần di chuyển');
  await expect(card).toContainText('1 → 0');
  await expect(card).toContainText('Đang xem trước bằng bóng màu tím trong chế độ xem 3D.');
  await card.getByRole('button', { name: 'Chấp nhận' }).click();
  await expect(card).toContainText('Đã áp dụng');
  await expect(assistant.log).toContainText('Xong: đã di chuyển 1 thiết bị trong một bước.');
  const status = page.getByRole('contentinfo', { name: 'Trạng thái' });
  const undo = page
    .getByRole('toolbar', { name: 'Công cụ chỉnh sửa' })
    .getByRole('button', { name: /^Hoàn tác/ });
  await expect(status).toContainText('Không có lỗi');
  await expect(undo).toHaveAccessibleName(/^Hoàn tác: /);
  await undo.click();
  await expect(status).toContainText('1 lỗi khoảng cách');
  await expect(undo, 'the accepted change was one undo step').toBeDisabled();
});

test('a Vietnamese question in the English interface is understood and answered in English', async ({
  page,
}) => {
  await openEditor(page);
  const assistant = await openAssistant(page);
  await expect(await ask(assistant, 'Có bao nhiêu máy biến áp?')).toContainText(
    'The layout has 2 transformers.',
  );
});

test('Stop ends a reply at once: the partial text stays, it is marked Stopped, and the next question still works', async ({
  page,
}) => {
  await openEditor(page);
  const assistant = await openAssistant(page);
  await assistant.chip('Summarise the layout').click();
  await assistant.stop.click();
  await expect(assistant.log).toHaveAttribute('aria-busy', 'false');
  const stopped = lastReply(assistant.log);
  await expect(stopped).toContainText('Stopped');
  const partial = await stopped.innerText();
  expect(partial, 'the summary was cut short').not.toContain('The bill of materials totals');
  await expect(assistant.chip('Summarise the layout')).toBeEnabled();

  await expect(await ask(assistant, 'How many drives?')).toContainText('The layout has 4 drives.');
  await expect(lastReply(assistant.log)).not.toContainText('Stopped');
});

test('typing in the message box never triggers editor shortcuts on the selected item', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('listbox', { name: 'Placed items' }).getByRole('option').first().click();
  const tag = await page.getByRole('textbox', { name: 'Tag' }).inputValue();
  const assistant = await openAssistant(page);
  await assistant.input.click();
  await page.keyboard.type('r1[]?+-f');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(assistant.input, 'Ctrl or Cmd + Z is the text box’s own undo').toHaveValue(
    'r1[]?+f',
  );
  await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Tag' })).toHaveValue(tag);
  await expect(page.getByRole('radio', { name: '0°', exact: true })).toBeChecked();
  await expect(
    page.getByRole('region', { name: 'Equipment' }).getByRole('button', { name: 'Cabinet' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(undoButton(page), 'nothing was edited').toBeDisabled();
});
