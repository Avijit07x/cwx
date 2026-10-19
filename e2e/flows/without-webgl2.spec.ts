import { expect, itemList, test } from '../support.ts';

test.use({ launchOptions: { args: ['--disable-webgl2'] } });

test('with WebGL 1 only, the 3D view says it is unavailable instead of crashing, and editing still works', async ({
  page,
}) => {
  await page.goto('/');
  const workspace = page.getByRole('main');
  await expect(workspace.getByText('3D view unavailable')).toBeVisible();
  await expect(workspace.getByText('The 3D view stopped working')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(itemList(page).getByRole('option').first()).toBeVisible();
});
