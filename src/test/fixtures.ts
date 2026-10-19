import { toItemId, type PlacedItem } from '../domain/types';

let counter = 0;

export function makeItem(overrides: Partial<PlacedItem> = {}): PlacedItem {
  counter += 1;
  return {
    id: toItemId(`test-${counter}`),
    kind: 'drive',
    tag: `T-${counter}`,
    x: 0.25,
    z: 0.25,
    rotation: 0,
    ...overrides,
  };
}
