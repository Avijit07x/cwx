import { defineMessages } from '../../i18n/define';

export const ruleCheckMessages = defineMessages(
  {
    'rules.title': 'Rule check',
    'rules.count.one': '{count} issue',
    'rules.count.other': '{count} issues',
    'rules.noIssues': 'No issues',
    'rules.rule': 'Minimum clearance between items: {min}',
    'rules.listLabel': 'Clearance issues',
    'rules.showItem': 'Select {tag} and show it in the 3D view',
    'rules.emptyTitle': 'No clearance issues',
    'rules.emptyBody': 'Every item is at least {min} from its neighbours.',
  },
  {
    'rules.title': 'Kiểm tra quy tắc',
    'rules.count.one': '{count} vấn đề',
    'rules.count.other': '{count} vấn đề',
    'rules.noIssues': 'Không có vấn đề',
    'rules.rule': 'Khoảng cách tối thiểu giữa các thiết bị: {min}',
    'rules.listLabel': 'Các vi phạm khoảng cách',
    'rules.showItem': 'Chọn {tag} và hiển thị trong chế độ xem 3D',
    'rules.emptyTitle': 'Không có vi phạm khoảng cách',
    'rules.emptyBody': 'Mọi thiết bị đều cách các thiết bị lân cận ít nhất {min}.',
  },
);
