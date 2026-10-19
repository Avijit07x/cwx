import { defineMessages } from '../../i18n/define';

export const itemListMessages = defineMessages(
  {
    'list.title': 'Placed items',
    'list.filterLabel': 'Filter placed items',
    'list.filterPlaceholder': 'Filter by tag or type',
    'list.filteredCount': '{shown} of {total}',
    'list.position': 'X {x} · Z {z}',
    'list.tooClose': 'Too close',
    'list.instructions':
      'Up and down arrow keys select an item, Enter shows it in the 3D view, Delete removes it.',
    'list.empty': 'No items placed yet',
    'list.emptyHint':
      'Choose equipment from the palette, then click the floor to place it, or move it with the arrow keys and press Enter.',
    'list.noMatches': 'No items match “{query}”',
    'list.clearFilter': 'Clear filter',
    'list.matches.one': '{count} item matches.',
    'list.matches.other': '{count} items match.',
  },
  {
    'list.title': 'Thiết bị đã đặt',
    'list.filterLabel': 'Lọc thiết bị đã đặt',
    'list.filterPlaceholder': 'Lọc theo mã hoặc loại',
    'list.filteredCount': '{shown} trên {total}',
    'list.position': 'X {x} · Z {z}',
    'list.tooClose': 'Quá gần',
    'list.instructions':
      'Phím mũi tên lên và xuống để chọn thiết bị, Enter để xem trong chế độ 3D, Delete để xóa.',
    'list.empty': 'Chưa có thiết bị nào',
    'list.emptyHint':
      'Chọn thiết bị trong bảng thiết bị rồi nhấp vào sàn để đặt, hoặc di chuyển bằng phím mũi tên và nhấn Enter.',
    'list.noMatches': 'Không có thiết bị nào khớp với “{query}”',
    'list.clearFilter': 'Xóa bộ lọc',
    'list.matches.one': '{count} thiết bị khớp.',
    'list.matches.other': '{count} thiết bị khớp.',
  },
);
