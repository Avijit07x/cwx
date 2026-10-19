import { defineMessages } from '../i18n/define';

export const embedMessages = defineMessages(
  {
    'embed.connecting': 'Connecting to the host application…',
    'embed.connectingHint': 'Waiting for the project and user details from the host.',
    'embed.connected': 'Connected to the host application.',
    'embed.errorTitle': 'Can’t connect to the host application',
    'embed.error.no-host':
      'The layout editor only runs inside an approved host application. Open it from your product selector.',
    'embed.error.init-timeout':
      'The host application did not respond in time. Reload the editor to try again.',
    'embed.errorCode': 'Error code: {code}',
    'embed.reload': 'Reload editor',
    'embed.badgeRegion': 'Host connection',
    'embed.badgeLabel': 'Embedded',
    'embed.tokenValid': 'Token valid for {time}',
    'embed.sendQuote': 'Send BOM to quote',
    'embed.quoteSent': 'Bill of materials sent to the host application for a quote.',
    'embed.expiredTitle': 'Access expired.',
    'embed.expiredBody':
      'Waiting for the host application to renew it. Sending to quote is paused until then.',
  },
  {
    'embed.connecting': 'Đang kết nối với ứng dụng chủ…',
    'embed.connectingHint': 'Đang chờ thông tin dự án và người dùng từ ứng dụng chủ.',
    'embed.connected': 'Đã kết nối với ứng dụng chủ.',
    'embed.errorTitle': 'Không thể kết nối với ứng dụng chủ',
    'embed.error.no-host':
      'Trình bố trí chỉ chạy bên trong một ứng dụng chủ được phép. Hãy mở trình bố trí từ ứng dụng chọn sản phẩm của bạn.',
    'embed.error.init-timeout':
      'Ứng dụng chủ không phản hồi kịp thời. Hãy tải lại trình bố trí để thử lại.',
    'embed.errorCode': 'Mã lỗi: {code}',
    'embed.reload': 'Tải lại trình bố trí',
    'embed.badgeRegion': 'Kết nối với ứng dụng chủ',
    'embed.badgeLabel': 'Chế độ nhúng',
    'embed.tokenValid': 'Mã truy cập còn hiệu lực {time}',
    'embed.sendQuote': 'Gửi BOM để báo giá',
    'embed.quoteSent': 'Đã gửi bảng kê vật tư đến ứng dụng chủ để báo giá.',
    'embed.expiredTitle': 'Quyền truy cập đã hết hạn.',
    'embed.expiredBody':
      'Đang chờ ứng dụng chủ gia hạn. Tạm dừng gửi báo giá cho đến khi được gia hạn.',
  },
);
