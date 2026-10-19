import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { beginDrag, setLocale, updateDrag } from '../../state/actions';
import { resetEditor, useEditor, type SaveStatus } from '../../state/store';
import { makeItem } from '../../test/fixtures';
import { setCursorPoint } from '../../viewport/cursorStore';
import { StatusBar } from './StatusBar';

const cabinet = makeItem({ kind: 'cabinet', tag: 'CAB-01', x: 3, z: 1.25 });
const drive = makeItem({ kind: 'drive', tag: 'VFD-01', x: 8.25, z: 6.25 });
const crowdingDrive = makeItem({ kind: 'drive', tag: 'VFD-02', x: 4.25, z: 1.25 });

beforeEach(() => {
  resetEditor([cabinet, drive]);
  setCursorPoint(null);
});

const itemWithText = (text: string) => screen.getByText(text).closest('li');

describe('StatusBar', () => {
  it('is a labelled footer that counts the items with the right plural form', () => {
    resetEditor([cabinet]);
    render(<StatusBar />);

    expect(screen.getByRole('contentinfo', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();

    act(() => {
      resetEditor([cabinet, drive]);
    });
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('shows a green all-clear, or clearance issues in red, live while dragging', () => {
    render(<StatusBar />);
    expect(itemWithText('No issues')).toHaveAttribute('data-tone', 'success');

    act(() => {
      beginDrag(drive.id);
      updateDrag({ x: crowdingDrive.x, z: crowdingDrive.z });
    });
    expect(itemWithText('1 clearance issue')).toHaveAttribute('data-tone', 'danger');

    act(() => {
      resetEditor([
        cabinet,
        crowdingDrive,
        makeItem({ kind: 'drive', tag: 'VFD-03', x: 4.25, z: 2.25 }),
      ]);
    });
    expect(itemWithText('2 clearance issues')).toHaveAttribute('data-tone', 'danger');
  });

  it('shows the pointer position on the floor, or a placeholder off the floor', () => {
    render(<StatusBar />);
    expect(screen.getByText('Pointer is not over the floor')).toBeInTheDocument();

    act(() => {
      setCursorPoint({ x: 3.5, z: 2 });
    });
    expect(screen.getByText('X 3.50 m · Z 2.00 m')).toBeInTheDocument();
    expect(screen.queryByText('Pointer is not over the floor')).not.toBeInTheDocument();
  });

  it('shows the grid and room size', () => {
    render(<StatusBar />);

    expect(screen.getByText('Grid 0.50 m · Room 20 × 12 m')).toBeInTheDocument();
  });

  it('describes every save state', () => {
    render(<StatusBar />);
    const cases: readonly (readonly [SaveStatus, string])[] = [
      ['idle', 'Autosave on'],
      ['pending', 'Saving…'],
      ['saved', 'Saved'],
      ['off', 'Autosave off'],
    ];

    for (const [saveStatus, text] of cases) {
      act(() => {
        useEditor.setState({ saveStatus });
      });
      expect(itemWithText(text)).not.toHaveAttribute('data-tone');
    }
    expect(itemWithText('Autosave off')).toHaveAttribute(
      'title',
      'Changes in this session are not saved.',
    );

    act(() => {
      useEditor.setState({ saveStatus: 'error' });
    });
    const failed = itemWithText('Not saved');
    expect(failed).toHaveAttribute('data-tone', 'danger');
    expect(failed).toHaveAttribute('title', 'The draft could not be saved in this browser.');
  });

  it('formats every value in Vietnamese', () => {
    setLocale('vi');
    setCursorPoint({ x: 12.25, z: 3.5 });
    render(<StatusBar />);

    expect(screen.getByRole('contentinfo', { name: 'Trạng thái' })).toBeInTheDocument();
    expect(screen.getByText('2 thiết bị')).toBeInTheDocument();
    expect(screen.getByText('Không có lỗi')).toBeInTheDocument();
    expect(screen.getByText('X 12,25 m · Z 3,50 m')).toBeInTheDocument();
    expect(screen.getByText('Lưới 0,50 m · Phòng 20 × 12 m')).toBeInTheDocument();
    expect(screen.getByText('Tự động lưu: bật')).toBeInTheDocument();
  });
});
