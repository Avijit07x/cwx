import type { Page } from '@playwright/test';
import {
  englishOnlyPhrases,
  englishOnScreen,
  expect,
  openHost,
  seriousAxeViolations,
  test,
  waitForView,
} from '../support.ts';

const VI_TITLE = 'Trình bố trí thiết bị';

async function openInVietnamese(page: Page, path = '/'): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('layout-editor:v1:locale', 'vi');
  });
  await page.goto(path);
}

interface VietnameseState {
  readonly name: string;
  readonly enter: (page: Page) => Promise<void>;
}

const STATES: readonly VietnameseState[] = [
  {
    name: 'shortcut dialog',
    enter: async (page) => {
      await openInVietnamese(page);
      await waitForView(page);
      await page.getByRole('button', { name: 'Phím tắt' }).click();
      const dialog = page.getByRole('dialog', { name: 'Phím tắt' });
      await expect(dialog).toBeVisible();
      await expect(dialog, 'distances use the Vietnamese decimal comma').toContainText('0,50 m');
    },
  },
  {
    name: 'placement mode',
    enter: async (page) => {
      await openInVietnamese(page);
      await waitForView(page);
      await page.getByRole('button', { name: 'Tủ điện', exact: true }).click();
      await expect(page.getByText('Đang đặt: Tủ đóng cắt', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'empty layout',
    enter: async (page) => {
      await openInVietnamese(page);
      await waitForView(page);
      await page.getByRole('toolbar').getByRole('button', { name: 'Xóa bố trí' }).click();
      await expect(page.getByText('Chưa có thiết bị nào')).toBeVisible();
      await expect(page.getByText('Chưa có thiết bị', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'draft-restored toast',
    enter: async (page) => {
      await openInVietnamese(page);
      await waitForView(page);
      await page.getByRole('listbox').focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Delete');
      await expect(page.getByRole('contentinfo')).toContainText('Đã lưu');
      await page.reload();
      const notice = page.getByText('Đã khôi phục bản nháp gần nhất.');
      await expect(notice).toBeVisible();
      await expect(page.locator('[data-sonner-toast]', { has: notice })).toHaveCSS('opacity', '1');
    },
  },
  {
    name: 'error toast when the draft cannot be saved',
    enter: async (page) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('layout-editor:v1:locale', 'vi');
        Object.defineProperty(Storage.prototype, 'setItem', {
          value: () => {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          },
        });
      });
      await page.goto('/');
      await waitForView(page);
      await page.getByRole('listbox').focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Delete');
      await expect(page.getByText('Không thể lưu bản nháp trong trình duyệt này.')).toBeVisible();
    },
  },
  {
    name: '3D view unavailable without WebGL',
    enter: async (page) => {
      await page.addInitScript(() => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null });
      });
      await openInVietnamese(page);
      await expect(page.getByText('Không thể hiển thị chế độ xem 3D')).toBeVisible();
    },
  },
  {
    name: '3D view after the graphics context is lost',
    enter: async (page) => {
      await openInVietnamese(page);
      const canvas = await waitForView(page);
      await canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) return;
        element.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      });
      await expect(page.getByRole('button', { name: 'Tải lại chế độ xem 3D' })).toBeVisible();
    },
  },
  {
    name: 'embedded mode opened outside a host',
    enter: async (page) => {
      await openInVietnamese(page, '/?embed=1');
      await expect(
        page.getByRole('alertdialog', { name: 'Không thể kết nối với ứng dụng chủ' }),
      ).toBeVisible();
    },
  },
  {
    name: 'performance overlay',
    enter: async (page) => {
      await openInVietnamese(page, '/?perf=1');
      await waitForView(page);
      const overlay = page.getByRole('region', { name: 'Hiệu năng' });
      await expect(overlay, 'frame times use the Vietnamese decimal comma').toContainText(
        /TB \d+,\d/,
        { timeout: 15_000 },
      );
    },
  },
  {
    name: '500 items with many clearance issues',
    enter: async (page) => {
      await openInVietnamese(page, '/?seed=500');
      await waitForView(page);
      await expect(page.getByRole('contentinfo')).toContainText('500 thiết bị');
    },
  },
  {
    name: 'assistant help reply',
    enter: async (page) => {
      await openInVietnamese(page);
      await waitForView(page);
      await page.getByRole('tab', { name: 'Trợ lý' }).click();
      const message = page.getByRole('textbox', { name: 'Tin nhắn gửi trợ lý' });
      await message.fill('xin chào');
      await message.press('Enter');
      const log = page.getByRole('log');
      await expect(log).toContainText('xin chào');
      await expect(log).toHaveAttribute('aria-busy', 'false');
    },
  },
];

for (const state of STATES) {
  test(`in Vietnamese, the ${state.name} shows no English-only text, keeps lang and title, and has no serious axe violation`, async ({
    page,
  }) => {
    await state.enter(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page).toHaveTitle(VI_TITLE);
    const phrases = await englishOnlyPhrases();
    expect(phrases.length, 'English-only phrases found in the dictionaries').toBeGreaterThan(200);
    expect.soft(await englishOnScreen(page, phrases), 'English-only text on screen').toEqual([]);
    expect.soft(await seriousAxeViolations(page), 'axe').toEqual([]);
  });
}

test('the embedded editor shows its draft-restored notice in the language of the host’s init', async ({
  context,
  page,
}) => {
  const editor = await openHost(page);
  await waitForView(editor);
  const list = editor.getByRole('listbox', { name: 'Placed items' });
  await list.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Delete');
  await expect(editor.getByRole('contentinfo')).toContainText('Saved');
  await expect(editor.locator('html')).toHaveAttribute('lang', 'en');

  const host = await context.newPage();
  await host.addInitScript(() => {
    if (window.top !== window) return;
    new MutationObserver((_records, observer) => {
      const select = document.getElementById('locale-select');
      if (!(select instanceof HTMLSelectElement) || !select.querySelector('option[value="vi"]')) {
        return;
      }
      select.value = 'vi';
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.close();
  const reopened = await openHost(host);
  await expect(host.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(reopened.locator('html')).toHaveAttribute('lang', 'vi');
  const notice = reopened.locator('[data-sonner-toast]').first();
  await expect(notice).toBeVisible({ timeout: 20_000 });
  expect(await notice.innerText(), 'the notice follows the language of the init message').toBe(
    'Đã khôi phục bản nháp gần nhất.',
  );
});
