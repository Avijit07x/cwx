import { act, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, expect, it, vi } from 'vitest';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { setShortcutHelpOpen, useShortcutStore } from './shortcutStore';

vi.mock('./ShortcutHelpPopup', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

beforeEach(() => {
  useShortcutStore.setState({ helpOpen: false, singleKeys: true });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

it('closes the dialog and says so when the shortcut list cannot be downloaded', async () => {
  render(<ShortcutHelpDialog trigger={<button type="button">Open shortcuts</button>} />);

  act(() => {
    setShortcutHelpOpen(true);
  });

  await waitFor(() => {
    expect(useShortcutStore.getState().helpOpen).toBe(false);
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open shortcuts' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(toast.getToasts()).toEqual([
    expect.objectContaining({
      type: 'error',
      title: 'The shortcut list could not be loaded. Reload the page to try again.',
    }),
  ]);
});
