import type { Locator } from '@playwright/test';
import { expect, openHost, test } from '../support.ts';

async function messagesInOrder(log: Locator): Promise<string[]> {
  const entries = await log
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map(
        (item) =>
          `${item.getAttribute('data-direction') ?? ''} ${item.getAttribute('data-type') ?? ''}`,
      ),
    );
  return entries.reverse();
}

test('host.html: ready then init, the embedded editor shows the project and user, and the host language drives the editor', async ({
  page,
}) => {
  const editor = await openHost(page);
  await expect(page.getByRole('list', { name: 'Message log' })).toBeVisible();
  const log = page.locator('#message-log');
  await expect
    .poll(async () => (await messagesInOrder(log)).slice(0, 2))
    .toEqual(['received ready', 'sent init']);

  const project = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  expect(project).toBe('Harbor plant · Electrical room B');
  const editorRoot = editor.locator('html');
  await expect(editor.getByText(project, { exact: true })).toBeVisible();
  await expect(editor.getByText('Alex Morgan', { exact: true })).toBeVisible();
  await expect(editor.getByRole('region', { name: 'Host connection' })).toContainText('Embedded');
  await expect(editorRoot).toHaveAttribute('lang', 'en');
  await expect(editor.getByRole('region', { name: 'Bill of materials' })).toBeVisible();

  await page.locator('#locale-select').selectOption('vi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect.poll(async () => messagesInOrder(log)).toContain('sent locale');
  await expect(editorRoot, 'the editor follows the host language').toHaveAttribute('lang', 'vi');
  await expect(editor.getByRole('region', { name: 'Bảng kê vật tư' })).toBeVisible();
  await expect(editor.getByRole('toolbar', { name: 'Công cụ chỉnh sửa' })).toBeVisible();
  await expect(editor.getByRole('region', { name: 'Kết nối với ứng dụng chủ' })).toContainText(
    'Chế độ nhúng',
  );
  await expect(editor.getByText(project, { exact: true })).toBeVisible();

  await page.locator('#locale-select').selectOption('en');
  await expect(editorRoot).toHaveAttribute('lang', 'en');
  await expect(editor.getByRole('region', { name: 'Bill of materials' })).toBeVisible();
});
