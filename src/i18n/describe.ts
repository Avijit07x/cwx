import type { EditLabel } from '../domain/history';
import { TAG_MAX_LENGTH, type EditError } from '../domain/ops';
import { MIN_CLEARANCE, type Violation } from '../domain/rules';
import type { ItemId } from '../domain/types';
import type { Translator } from './translate';

export type TagLookup = (id: ItemId) => string;

export function describeEdit(t: Translator, label: EditLabel): string {
  switch (label.action) {
    case 'clear':
      return t.t('history.clear');
    case 'assistant':
      return t.plural('history.assistant', label.count);
    default:
      return t.t(`history.${label.action}`, { subject: label.subject });
  }
}

export function describeEditError(t: Translator, error: EditError, tagOf: TagLookup): string {
  switch (error.code) {
    case 'out-of-bounds':
    case 'off-grid':
      return t.t(`error.${error.code}`, { subject: tagOf(error.id) });
    case 'tag-too-long':
      return t.t('error.tag-too-long', { max: TAG_MAX_LENGTH });
    case 'duplicate-tag':
      return t.t('error.duplicate-tag', { tag: error.tag });
    default:
      return t.t(`error.${error.code}`);
  }
}

export function describeViolation(t: Translator, violation: Violation, tagOf: TagLookup): string {
  const params = {
    a: tagOf(violation.a),
    b: tagOf(violation.b),
    gap: t.metres(violation.gap),
    min: t.metres(MIN_CLEARANCE),
  };
  return violation.overlap ? t.t('rule.overlap', params) : t.t('rule.clearance', params);
}
