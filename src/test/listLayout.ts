import { vi, type Mock } from 'vitest';

export type ScrollToMock = Mock<(options?: ScrollToOptions | number, y?: number) => void>;

interface ListLayout {
  readonly viewport: number;
  readonly row: number;
}

function contentHeight(element: Element): number {
  const sizer = element.firstElementChild;
  return sizer instanceof HTMLElement ? Number.parseFloat(sizer.style.height) || 0 : 0;
}

export function mockListLayout({ viewport, row }: ListLayout): ScrollToMock {
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(viewport);
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return contentHeight(this);
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 0, row));
  const scrollTo: ScrollToMock = vi.fn(function (
    this: Element,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === 'object' && options.top !== undefined) this.scrollTop = options.top;
  });
  Element.prototype.scrollTo = scrollTo;
  return scrollTo;
}
