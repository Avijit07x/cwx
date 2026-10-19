import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach } from 'vitest';

HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
  this.open = true;
};

HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event('close'));
};

const pointerCaptures = new WeakSet<Element>();

Element.prototype.setPointerCapture = function setPointerCapture(this: Element): void {
  pointerCaptures.add(this);
};

Element.prototype.releasePointerCapture = function releasePointerCapture(this: Element): void {
  pointerCaptures.delete(this);
};

Element.prototype.hasPointerCapture = function hasPointerCapture(this: Element): boolean {
  return pointerCaptures.has(this);
};

afterEach(() => {
  cleanup();
  toast.dismiss();
});
