import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual';

export function keepIndexRendered(index: number): (range: Range) => number[] {
  return (range) => {
    const indexes = defaultRangeExtractor(range);
    if (index < 0 || index >= range.count || indexes.includes(index)) return indexes;
    return [...indexes, index].sort((first, second) => first - second);
  };
}
