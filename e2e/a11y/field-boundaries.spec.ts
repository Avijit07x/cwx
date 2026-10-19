import type { Locator } from '@playwright/test';
import { expect, itemList, openEditor, restPointer, test } from '../support.ts';

const MIN_BOUNDARY_CONTRAST = 3;

function boundaryContrast(field: Locator): Promise<number> {
  return field.evaluate((input) => {
    type Rgba = readonly [number, number, number, number];
    const rgba = (color: string): Rgba => {
      const [r = 0, g = 0, b = 0, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const luminance = ([r, g, b]: Rgba): number => {
      const linear = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const ratio = (a: Rgba, b: Rgba): number => {
      const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((p, q) => q - p);
      return (light + 0.05) / (dark + 0.05);
    };
    const hasBorder = (style: CSSStyleDeclaration) =>
      style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) >= 1;
    let box: Element = input;
    for (let node: Element | null = input; node && node !== document.body;) {
      if (hasBorder(getComputedStyle(node))) {
        box = node;
        break;
      }
      node = node.parentElement;
    }
    let outside: Rgba = [255, 255, 255, 1];
    for (let node = box.parentElement; node; node = node.parentElement) {
      const color = rgba(getComputedStyle(node).backgroundColor);
      if (color[3] >= 0.5) {
        outside = color;
        break;
      }
    }
    const style = getComputedStyle(box);
    const cues = [rgba(style.backgroundColor)];
    if (hasBorder(style)) cues.push(rgba(style.borderTopColor));
    return Math.max(1, ...cues.filter((cue) => cue[3] >= 0.5).map((cue) => ratio(cue, outside)));
  });
}

test('text fields have a boundary or fill with at least 3:1 contrast against the panel (WCAG 1.4.11)', async ({
  page,
}) => {
  await openEditor(page);
  await itemList(page)
    .getByRole('option', { name: /^CAB-01 / })
    .click();
  await expect(page.getByRole('textbox', { name: 'Tag' })).toHaveValue('CAB-01');
  await restPointer(page);
  const fields: readonly (readonly [string, Locator])[] = [
    ['Filter placed items', page.getByRole('searchbox', { name: 'Filter placed items' })],
    ['Tag', page.getByRole('textbox', { name: 'Tag', exact: true })],
    ['X', page.getByRole('textbox', { name: 'X', exact: true })],
    ['Z', page.getByRole('textbox', { name: 'Z', exact: true })],
  ];
  for (const [name, field] of fields) {
    expect
      .soft(await boundaryContrast(field), `${name}: the field's outline or fill against the panel`)
      .toBeGreaterThanOrEqual(MIN_BOUNDARY_CONTRAST);
  }

  await page.getByRole('tab', { name: 'Assistant' }).click();
  const composer = page.getByRole('textbox', { name: 'Message to the assistant' });
  await expect(composer).toBeVisible();
  await restPointer(page);
  expect
    .soft(await boundaryContrast(composer), "the assistant composer's outline against the panel")
    .toBeGreaterThanOrEqual(MIN_BOUNDARY_CONTRAST);
});
