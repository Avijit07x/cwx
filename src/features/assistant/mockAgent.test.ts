import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleLayout } from '../../domain/seed';
import { LOCALES } from '../../i18n/locales';
import { getTranslator } from '../../i18n/translate';
import {
  CHUNK_DELAY_MS,
  chunkWords,
  detectIntent,
  streamAssistantReply,
  type AssistantContext,
  type AssistantEvent,
} from './mockAgent';

const context: AssistantContext = { locale: 'en', items: sampleLayout() };

function start(prompt: string, signal: AbortSignal, overrides: Partial<AssistantContext> = {}) {
  const events: AssistantEvent[] = [];
  const finished = (async () => {
    for await (const event of streamAssistantReply(prompt, { ...context, ...overrides }, signal)) {
      events.push(event);
    }
    return null;
  })().catch((error: unknown) => error);
  return { events, finished };
}

async function reply(prompt: string, overrides: Partial<AssistantContext> = {}) {
  const run = start(prompt, new AbortController().signal, overrides);
  await vi.runAllTimersAsync();
  expect(await run.finished).toBeNull();
  return run.events;
}

function textOf(events: readonly AssistantEvent[]): string {
  return events.map((event) => (event.type === 'text' ? event.delta : '')).join('');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('detectIntent', () => {
  it.each([
    ['Fix clearance issues', 'fix'],
    ['Can you resolve the violations?', 'fix'],
    ['Check clearance please', 'fix'],
    ['Khắc phục lỗi khoảng cách', 'fix'],
    ['Sửa giúp tôi', 'fix'],
    ['sua loi khoang cach', 'fix'],
    ['Summarise the layout', 'summary'],
    ['summarize this room', 'summary'],
    ['Give me an overview', 'summary'],
    ['Tóm tắt bố trí', 'summary'],
    ['How many drives?', 'count'],
    ['count everything', 'count'],
    ['Có bao nhiêu biến tần?', 'count'],
    ['co bao nhieu tu dien', 'count'],
    ['Hello there', 'help'],
    ['Xin chào', 'help'],
    ['', 'help'],
  ])('reads "%s" as %s', (prompt, type) => {
    expect(detectIntent(prompt).type).toBe(type);
  });

  it('picks out item types named in English and Vietnamese', () => {
    expect(detectIntent('How many drives?')).toEqual({ type: 'count', kinds: ['drive'] });
    expect(detectIntent('How many VFDs are placed?')).toEqual({ type: 'count', kinds: ['drive'] });
    expect(detectIntent('Count the cabinets and UPS units')).toEqual({
      type: 'count',
      kinds: ['cabinet', 'ups'],
    });
    expect(detectIntent('Có bao nhiêu máy biến áp?')).toEqual({
      type: 'count',
      kinds: ['transformer'],
    });
    expect(detectIntent('Bao nhiêu tủ điện và bộ lưu điện UPS?')).toEqual({
      type: 'count',
      kinds: ['cabinet', 'ups'],
    });
    expect(detectIntent('co bao nhieu tu dien')).toEqual({ type: 'count', kinds: ['cabinet'] });
    expect(detectIntent('How many items are there?')).toEqual({ type: 'count', kinds: [] });
  });

  it.each(LOCALES)('maps the %s suggestion chips to their intents', (locale) => {
    const t = getTranslator(locale);
    expect(detectIntent(t.t('assistant.suggest.fix'))).toEqual({ type: 'fix' });
    expect(detectIntent(t.t('assistant.suggest.summary'))).toEqual({ type: 'summary' });
    expect(detectIntent(t.t('assistant.suggest.count'))).toEqual({
      type: 'count',
      kinds: ['drive'],
    });
  });

  it('does not match keywords inside other words', () => {
    expect(detectIntent('prefix the tags').type).toBe('help');
    expect(detectIntent('công suất là bao nhiêu').type).toBe('count');
  });
});

describe('chunkWords', () => {
  it('splits text into chunks of two to four words that join back to the original', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    for (let length = 2; length <= 13; length++) {
      const words = text.split(' ').slice(0, length).join(' ');
      const chunks = chunkWords(words);
      expect(chunks.join('')).toBe(words);
      for (const chunk of chunks) {
        expect(wordCount(chunk)).toBeGreaterThanOrEqual(2);
        expect(wordCount(chunk)).toBeLessThanOrEqual(4);
      }
    }
    expect(chunkWords('Done.')).toEqual(['Done.']);
    expect(chunkWords('a b\n\nc d e').join('')).toBe('a b\n\nc d e');
  });
});

describe('streamAssistantReply', () => {
  it('streams text deltas about 35 ms apart, then the proposal, then done', async () => {
    vi.useFakeTimers();
    const run = start('Fix clearance issues', new AbortController().signal);

    await vi.advanceTimersByTimeAsync(CHUNK_DELAY_MS - 1);
    expect(run.events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(CHUNK_DELAY_MS);
    expect(run.events).toHaveLength(2);

    await vi.runAllTimersAsync();
    expect(await run.finished).toBeNull();
    const types = run.events.map((event) => event.type);
    expect(types.filter((type) => type === 'proposal')).toHaveLength(1);
    expect(types.at(-1)).toBe('done');
    for (const event of run.events) {
      if (event.type === 'text') expect(wordCount(event.delta)).toBeLessThanOrEqual(4);
    }
    const proposal = run.events.find((event) => event.type === 'proposal');
    expect(proposal).toMatchObject({
      proposal: { violationsBefore: 1, violationsAfter: 0 },
    });
    expect(textOf(run.events)).toContain('I found 1 clearance issue.');
  });

  it('stops yielding and throws an AbortError when the signal aborts', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const run = start('Summarise the layout', controller.signal);

    await vi.advanceTimersByTimeAsync(CHUNK_DELAY_MS * 2);
    expect(run.events).toHaveLength(2);
    controller.abort();

    expect(await run.finished).toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(CHUNK_DELAY_MS * 10);
    expect(run.events).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = start('Summarise the layout', controller.signal);

    expect(await run.finished).toMatchObject({ name: 'AbortError' });
    expect(run.events).toEqual([]);
  });

  it('summarises the layout with real numbers', async () => {
    vi.useFakeTimers();
    const t = getTranslator('en');
    const text = textOf(await reply('Summarise the layout'));

    expect(text).toContain(
      'The layout has 12 items: 4 cabinets, 4 drives, 2 transformers, and 2 UPS units.',
    );
    expect(text).toContain(
      'There is 1 clearance issue. TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m).',
    );
    expect(text).toContain(`The bill of materials totals ${t.usd(89000)}.`);
    expect(text.endsWith('Say “fix clearance” and I will propose moves.')).toBe(true);
    expect(detectIntent('fix clearance')).toEqual({ type: 'fix' });
  });

  it('counts the item types that were asked about, in either language', async () => {
    vi.useFakeTimers();
    expect(textOf(await reply('How many drives?'))).toBe('The layout has 4 drives.');
    expect(textOf(await reply('Có bao nhiêu biến tần?', { locale: 'vi' }))).toBe(
      'Bố trí có 4 biến tần.',
    );
    expect(textOf(await reply('How many transformers?', { items: [] }))).toBe(
      'The layout has 0 transformers.',
    );
  });

  it('answers in the requested language and falls back to help', async () => {
    vi.useFakeTimers();
    const tVi = getTranslator('vi');
    expect(textOf(await reply('Xin chào', { locale: 'vi' }))).toBe(tVi.t('assistant.reply.help'));
    const fix = textOf(await reply('Khắc phục lỗi khoảng cách', { locale: 'vi' }));
    expect(fix).toContain('Tôi tìm thấy 1 lỗi khoảng cách.');
  });

  it('says so when there is nothing to fix', async () => {
    vi.useFakeTimers();
    const events = await reply('fix', { items: [] });
    expect(events.some((event) => event.type === 'proposal')).toBe(false);
    expect(textOf(events)).toBe(
      'There are no clearance issues to fix: every item is at least 0.60 m from its neighbours.',
    );
  });
});
