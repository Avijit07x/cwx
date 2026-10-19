import { deriveBom, type Bom } from '../../domain/bom';
import { CATALOG } from '../../domain/catalog';
import type { Proposal } from '../../domain/proposal';
import { proposeClearanceFix } from '../../domain/proposeFix';
import { findViolations, MIN_CLEARANCE, type Violation } from '../../domain/rules';
import { ITEM_KINDS, type ItemId, type ItemKind, type PlacedItem } from '../../domain/types';
import { describeViolation } from '../../i18n/describe';
import { foldText } from '../../i18n/format';
import { LOCALES, type Locale } from '../../i18n/locales';
import { getTranslator, type Translator } from '../../i18n/translate';

export type AssistantEvent =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'proposal'; readonly proposal: Proposal }
  | { readonly type: 'done' };

export interface AssistantContext {
  readonly locale: Locale;
  readonly items: readonly PlacedItem[];
}

export type AssistantTransport = (
  prompt: string,
  context: AssistantContext,
  signal: AbortSignal,
) => AsyncIterable<AssistantEvent>;

type AssistantIntent =
  | { readonly type: 'fix' }
  | { readonly type: 'summary' }
  | { readonly type: 'count'; readonly kinds: readonly ItemKind[] }
  | { readonly type: 'help' };

type ReplyPart = Exclude<AssistantEvent, { readonly type: 'done' }>;

export const CHUNK_DELAY_MS = 35;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phrasePattern(phrases: readonly string[]): RegExp {
  const alternatives = [...new Set(phrases.map((phrase) => escapeRegExp(foldText(phrase))))];
  return new RegExp(`\\b(?:${alternatives.join('|')})s?\\b`);
}

const FIX_PATTERN = phrasePattern([
  'fix',
  'fixing',
  'resolve',
  'clearance',
  'sửa',
  'khắc phục',
  'khoảng cách',
]);
const SUMMARY_PATTERN = phrasePattern(['summary', 'summarise', 'summarize', 'overview', 'tóm tắt']);
const COUNT_PATTERN = phrasePattern(['how many', 'count', 'bao nhiêu', 'số lượng']);

function kindPattern(kind: ItemKind): RegExp {
  const names = LOCALES.flatMap((locale) => {
    const t = getTranslator(locale);
    return [t.kindName(kind), t.kindShort(kind)];
  });
  return phrasePattern([CATALOG[kind].tagPrefix, ...names]);
}

const KIND_PATTERNS: Readonly<Record<ItemKind, RegExp>> = {
  cabinet: kindPattern('cabinet'),
  drive: kindPattern('drive'),
  transformer: kindPattern('transformer'),
  ups: kindPattern('ups'),
};

export function detectIntent(prompt: string): AssistantIntent {
  const text = foldText(prompt);
  if (FIX_PATTERN.test(text)) return { type: 'fix' };
  if (SUMMARY_PATTERN.test(text)) return { type: 'summary' };
  if (COUNT_PATTERN.test(text)) {
    return { type: 'count', kinds: ITEM_KINDS.filter((kind) => KIND_PATTERNS[kind].test(text)) };
  }
  return { type: 'help' };
}

function kindCount(t: Translator, kind: ItemKind, count: number): string {
  return t.plural(`assistant.kind.${kind}`, count);
}

function inventory(t: Translator, bom: Bom): string {
  return t.t('assistant.reply.inventory', {
    total: t.plural('assistant.reply.items', bom.totalQuantity),
    breakdown: t.list(bom.lines.map((line) => kindCount(t, line.kind, line.quantity))),
  });
}

function tagLookup(items: readonly PlacedItem[]): (id: ItemId) => string {
  const tags = new Map(items.map((item) => [item.id, item.tag]));
  return (id) => tags.get(id) ?? '';
}

function issueSentences(
  t: Translator,
  items: readonly PlacedItem[],
  violations: readonly Violation[],
): string[] {
  const first = violations[0];
  if (!first) return [t.t('assistant.reply.clear', { min: t.metres(MIN_CLEARANCE) })];
  const issue = describeViolation(t, first, tagLookup(items));
  return [
    t.plural('assistant.reply.issues', violations.length),
    violations.length === 1 ? issue : t.t('assistant.reply.firstIssue', { issue }),
  ];
}

function summaryReply(t: Translator, items: readonly PlacedItem[]): string {
  if (items.length === 0) return t.t('assistant.reply.empty');
  const bom = deriveBom(items);
  const violations = findViolations(items);
  const sentences = [
    inventory(t, bom),
    ...issueSentences(t, items, violations),
    t.t('assistant.reply.bomTotal', { total: t.usd(bom.totalUsd) }),
  ];
  if (violations.length > 0) sentences.push(t.t('assistant.reply.offerFix'));
  return sentences.join(' ');
}

function countReply(
  t: Translator,
  items: readonly PlacedItem[],
  kinds: readonly ItemKind[],
): string {
  const bom = deriveBom(items);
  if (kinds.length > 0) {
    const quantity = (kind: ItemKind) =>
      bom.lines.find((line) => line.kind === kind)?.quantity ?? 0;
    const breakdown = t.list(kinds.map((kind) => kindCount(t, kind, quantity(kind))));
    return t.t('assistant.reply.countKinds', { breakdown });
  }
  return items.length === 0 ? t.t('assistant.reply.empty') : inventory(t, bom);
}

function fixReply(t: Translator, context: AssistantContext): ReplyPart[] {
  const violations = findViolations(context.items).length;
  if (violations === 0) {
    return [
      { type: 'text', delta: t.t('assistant.reply.noIssues', { min: t.metres(MIN_CLEARANCE) }) },
    ];
  }
  const found = t.plural('assistant.reply.found', violations);
  const proposal = proposeClearanceFix(context.items);
  if (!proposal) return [{ type: 'text', delta: `${found} ${t.t('assistant.reply.noFix')}` }];
  const moves = proposal.moves.length;
  const plan =
    proposal.violationsAfter === 0
      ? t.plural('assistant.reply.fixAll', moves)
      : t.plural('assistant.reply.fixSome', moves, { after: t.integer(proposal.violationsAfter) });
  return [
    { type: 'text', delta: `${found} ${plan}` },
    { type: 'proposal', proposal },
    { type: 'text', delta: `\n\n${t.t('assistant.reply.review')}` },
  ];
}

function composeReply(intent: AssistantIntent, context: AssistantContext): ReplyPart[] {
  const t = getTranslator(context.locale);
  switch (intent.type) {
    case 'fix':
      return fixReply(t, context);
    case 'summary':
      return [{ type: 'text', delta: summaryReply(t, context.items) }];
    case 'count':
      return [{ type: 'text', delta: countReply(t, context.items, intent.kinds) }];
    case 'help':
      return [{ type: 'text', delta: t.t('assistant.reply.help') }];
  }
}

export function chunkWords(text: string): string[] {
  const words = text.match(/\s*\S+/g) ?? [];
  const chunks: string[] = [];
  for (let start = 0; start < words.length;) {
    let size = 2 + (chunks.length % 3);
    if (words.length - start - size === 1) size += size < 4 ? 1 : -1;
    chunks.push(words.slice(start, start + size).join(''));
    start += size;
  }
  return chunks;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function* streamAssistantReply(
  prompt: string,
  context: AssistantContext,
  signal: AbortSignal,
): AsyncGenerator<AssistantEvent, void, undefined> {
  signal.throwIfAborted();
  for (const part of composeReply(detectIntent(prompt), context)) {
    if (part.type === 'proposal') {
      signal.throwIfAborted();
      yield part;
      continue;
    }
    for (const delta of chunkWords(part.delta)) {
      await pause(CHUNK_DELAY_MS, signal);
      signal.throwIfAborted();
      yield { type: 'text', delta };
    }
  }
  yield { type: 'done' };
}
