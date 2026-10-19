import { expect, openEditor, test } from './support.ts';

test('the editor loads with a live WebGL2 canvas and no console errors', async ({ page }) => {
  const canvas = await openEditor(page);
  const hasLiveWebGL = await canvas.evaluate((element) => {
    const context = element instanceof HTMLCanvasElement ? element.getContext('webgl2') : null;
    return context !== null && !context.isContextLost();
  });
  expect(hasLiveWebGL).toBe(true);
});
