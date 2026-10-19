import { defineMessages } from '../../i18n/define';

export const assistantMessages = defineMessages(
  {
    'assistant.title': 'Layout assistant',
    'assistant.simulated': 'Simulated assistant — runs in your browser',
    'assistant.simulatedDetail': 'Replies are scripted from your layout. Nothing is sent anywhere.',
    'assistant.log': 'Conversation',
    'assistant.welcomeTitle': 'Ask about this layout',
    'assistant.welcomeBody':
      'I can fix clearance issues, summarise the layout or count equipment by type.',
    'assistant.you': 'You:',
    'assistant.assistant': 'Assistant:',
    'assistant.stopped': 'Stopped',
    'assistant.failed': 'The assistant could not reply. Try again.',
    'assistant.suggestions': 'Suggestions',
    'assistant.suggest.fix': 'Fix clearance issues',
    'assistant.suggest.summary': 'Summarise the layout',
    'assistant.suggest.count': 'How many drives?',
    'assistant.inputLabel': 'Message to the assistant',
    'assistant.placeholder': 'Ask about the layout…',
    'assistant.inputHint': 'Enter to send · Shift+Enter for a new line',
    'assistant.send': 'Send',
    'assistant.stop': 'Stop',

    'assistant.proposal.title': 'Proposed change',
    'assistant.proposal.moves.one': '{count} move',
    'assistant.proposal.moves.other': '{count} moves',
    'assistant.proposal.axisChange': '{axis} {from} → {to}',
    'assistant.proposal.rotationChange': 'Rotation {from} → {to}',
    'assistant.proposal.issues': 'Clearance issues',
    'assistant.proposal.issuesChange': '{before} → {after}',
    'assistant.proposal.preview': 'Previewed as violet ghosts in the 3D view.',
    'assistant.proposal.accept': 'Accept',
    'assistant.proposal.reject': 'Reject',
    'assistant.proposal.askAgain': 'Ask again',
    'assistant.proposal.stale':
      'The layout changed since this proposal was made, so it can no longer be applied.',
    'assistant.proposal.applied': 'Applied',
    'assistant.proposal.rejected': 'Rejected',
    'assistant.proposal.closed': 'No longer previewed',

    'assistant.kind.cabinet.one': '{count} cabinet',
    'assistant.kind.cabinet.other': '{count} cabinets',
    'assistant.kind.drive.one': '{count} drive',
    'assistant.kind.drive.other': '{count} drives',
    'assistant.kind.transformer.one': '{count} transformer',
    'assistant.kind.transformer.other': '{count} transformers',
    'assistant.kind.ups.one': '{count} UPS unit',
    'assistant.kind.ups.other': '{count} UPS units',

    'assistant.reply.help':
      'I can fix clearance issues, summarise the layout or count equipment by type. Try one of the suggestions below, or ask “How many cabinets?”.',
    'assistant.reply.empty': 'The layout is empty. Pick equipment from the palette to get started.',
    'assistant.reply.items.one': '{count} item',
    'assistant.reply.items.other': '{count} items',
    'assistant.reply.inventory': 'The layout has {total}: {breakdown}.',
    'assistant.reply.countKinds': 'The layout has {breakdown}.',
    'assistant.reply.clear': 'Every item meets the {min} clearance.',
    'assistant.reply.issues.one': 'There is {count} clearance issue.',
    'assistant.reply.issues.other': 'There are {count} clearance issues.',
    'assistant.reply.firstIssue': 'The first: {issue}',
    'assistant.reply.bomTotal': 'The bill of materials totals {total}.',
    'assistant.reply.offerFix': 'Say “fix clearance” and I will propose moves.',
    'assistant.reply.noIssues':
      'There are no clearance issues to fix: every item is at least {min} from its neighbours.',
    'assistant.reply.found.one': 'I found {count} clearance issue.',
    'assistant.reply.found.other': 'I found {count} clearance issues.',
    'assistant.reply.fixAll.one':
      'Moving {count} item to the nearest free spot leaves no clearance issues.',
    'assistant.reply.fixAll.other':
      'Moving {count} items to the nearest free spots leaves no clearance issues.',
    'assistant.reply.fixSome.one':
      'Moving {count} item to the nearest free spot brings them down to {after}; the rest need more space than I could find.',
    'assistant.reply.fixSome.other':
      'Moving {count} items to the nearest free spots brings them down to {after}; the rest need more space than I could find.',
    'assistant.reply.noFix':
      'I could not find enough free space to move the items involved. Make room or remove an item, then ask again.',
    'assistant.reply.review': 'Check the preview in the 3D view, then accept or reject it below.',
    'assistant.reply.applied.one':
      'Done: {count} item moved in one step. Press {undoKey} to undo it.',
    'assistant.reply.applied.other':
      'Done: {count} items moved in one step. Press {undoKey} to undo it.',
  },
  {
    'assistant.title': 'Trợ lý bố trí',
    'assistant.simulated': 'Trợ lý mô phỏng — chạy ngay trong trình duyệt của bạn',
    'assistant.simulatedDetail':
      'Câu trả lời được tạo theo kịch bản từ bố trí của bạn. Không có dữ liệu nào được gửi đi.',
    'assistant.log': 'Hội thoại',
    'assistant.welcomeTitle': 'Hỏi về bố trí này',
    'assistant.welcomeBody':
      'Tôi có thể khắc phục lỗi khoảng cách, tóm tắt bố trí hoặc đếm thiết bị theo loại.',
    'assistant.you': 'Bạn:',
    'assistant.assistant': 'Trợ lý:',
    'assistant.stopped': 'Đã dừng',
    'assistant.failed': 'Trợ lý không thể trả lời. Hãy thử lại.',
    'assistant.suggestions': 'Gợi ý',
    'assistant.suggest.fix': 'Khắc phục lỗi khoảng cách',
    'assistant.suggest.summary': 'Tóm tắt bố trí',
    'assistant.suggest.count': 'Có bao nhiêu biến tần?',
    'assistant.inputLabel': 'Tin nhắn gửi trợ lý',
    'assistant.placeholder': 'Hỏi về bố trí…',
    'assistant.inputHint': 'Enter để gửi · Shift+Enter để xuống dòng',
    'assistant.send': 'Gửi',
    'assistant.stop': 'Dừng',

    'assistant.proposal.title': 'Thay đổi đề xuất',
    'assistant.proposal.moves.one': '{count} lần di chuyển',
    'assistant.proposal.moves.other': '{count} lần di chuyển',
    'assistant.proposal.axisChange': '{axis} {from} → {to}',
    'assistant.proposal.rotationChange': 'Góc xoay {from} → {to}',
    'assistant.proposal.issues': 'Lỗi khoảng cách',
    'assistant.proposal.issuesChange': '{before} → {after}',
    'assistant.proposal.preview': 'Đang xem trước bằng bóng màu tím trong chế độ xem 3D.',
    'assistant.proposal.accept': 'Chấp nhận',
    'assistant.proposal.reject': 'Từ chối',
    'assistant.proposal.askAgain': 'Hỏi lại',
    'assistant.proposal.stale':
      'Bố trí đã thay đổi kể từ khi có đề xuất này nên không thể áp dụng nữa.',
    'assistant.proposal.applied': 'Đã áp dụng',
    'assistant.proposal.rejected': 'Đã từ chối',
    'assistant.proposal.closed': 'Không còn xem trước',

    'assistant.kind.cabinet.one': '{count} tủ điện',
    'assistant.kind.cabinet.other': '{count} tủ điện',
    'assistant.kind.drive.one': '{count} biến tần',
    'assistant.kind.drive.other': '{count} biến tần',
    'assistant.kind.transformer.one': '{count} máy biến áp',
    'assistant.kind.transformer.other': '{count} máy biến áp',
    'assistant.kind.ups.one': '{count} bộ UPS',
    'assistant.kind.ups.other': '{count} bộ UPS',

    'assistant.reply.help':
      'Tôi có thể khắc phục lỗi khoảng cách, tóm tắt bố trí hoặc đếm thiết bị theo loại. Hãy thử một gợi ý bên dưới, hoặc hỏi “Có bao nhiêu tủ điện?”.',
    'assistant.reply.empty': 'Bố trí đang trống. Hãy chọn thiết bị từ bảng thiết bị để bắt đầu.',
    'assistant.reply.items.one': '{count} thiết bị',
    'assistant.reply.items.other': '{count} thiết bị',
    'assistant.reply.inventory': 'Bố trí có {total}: {breakdown}.',
    'assistant.reply.countKinds': 'Bố trí có {breakdown}.',
    'assistant.reply.clear': 'Mọi thiết bị đều đáp ứng khoảng cách {min}.',
    'assistant.reply.issues.one': 'Có {count} lỗi khoảng cách.',
    'assistant.reply.issues.other': 'Có {count} lỗi khoảng cách.',
    'assistant.reply.firstIssue': 'Lỗi đầu tiên: {issue}',
    'assistant.reply.bomTotal': 'Tổng giá trị danh mục vật tư là {total}.',
    'assistant.reply.offerFix': 'Hãy nói “khắc phục khoảng cách”, tôi sẽ đề xuất cách di chuyển.',
    'assistant.reply.noIssues':
      'Không có lỗi khoảng cách nào cần khắc phục: mọi thiết bị đều cách nhau ít nhất {min}.',
    'assistant.reply.found.one': 'Tôi tìm thấy {count} lỗi khoảng cách.',
    'assistant.reply.found.other': 'Tôi tìm thấy {count} lỗi khoảng cách.',
    'assistant.reply.fixAll.one':
      'Di chuyển {count} thiết bị đến vị trí trống gần nhất sẽ không còn lỗi khoảng cách.',
    'assistant.reply.fixAll.other':
      'Di chuyển {count} thiết bị đến các vị trí trống gần nhất sẽ không còn lỗi khoảng cách.',
    'assistant.reply.fixSome.one':
      'Di chuyển {count} thiết bị đến vị trí trống gần nhất sẽ giảm số lỗi còn {after}; các lỗi còn lại cần nhiều chỗ trống hơn mức tôi tìm được.',
    'assistant.reply.fixSome.other':
      'Di chuyển {count} thiết bị đến các vị trí trống gần nhất sẽ giảm số lỗi còn {after}; các lỗi còn lại cần nhiều chỗ trống hơn mức tôi tìm được.',
    'assistant.reply.noFix':
      'Tôi không tìm được đủ chỗ trống để di chuyển các thiết bị liên quan. Hãy dọn chỗ hoặc xóa bớt thiết bị rồi hỏi lại.',
    'assistant.reply.review':
      'Hãy kiểm tra bản xem trước trong chế độ xem 3D, sau đó chấp nhận hoặc từ chối bên dưới.',
    'assistant.reply.applied.one':
      'Xong: đã di chuyển {count} thiết bị trong một bước. Nhấn {undoKey} để hoàn tác.',
    'assistant.reply.applied.other':
      'Xong: đã di chuyển {count} thiết bị trong một bước. Nhấn {undoKey} để hoàn tác.',
  },
);
