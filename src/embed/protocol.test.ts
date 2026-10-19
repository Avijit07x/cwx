import { describe, expect, it } from 'vitest';
import {
  envelope,
  isProtocolMessage,
  LIMITS,
  parseEditorMessage,
  parseHostMessage,
  PROTOCOL,
  PROTOCOL_VERSION,
  type EditorMessage,
  type HostMessage,
  type InitPayload,
} from './protocol';

const INIT: InitPayload = {
  user: { id: 'u-1042', name: 'Alex Morgan' },
  project: { id: 'nw-prj-2041', name: 'Harbor plant · Electrical room B' },
  locale: 'vi',
  token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEwNDIifQ.c2lnbmF0dXJl',
  tokenExpiresAt: 1_792_000_000_000,
  theme: { accent: '#0B6AA2', fontFamily: 'system-ui', radius: 2 },
};

function hostEnvelope(type: string, payload: unknown) {
  return { protocol: PROTOCOL, version: PROTOCOL_VERSION, type, payload };
}

function initWith(changes: Readonly<Record<string, unknown>>) {
  return hostEnvelope('init', { ...INIT, ...changes });
}

const VALID_HOST_MESSAGES: readonly HostMessage[] = [
  { type: 'init', payload: INIT },
  { type: 'init', payload: { ...INIT, theme: undefined } },
  { type: 'token', payload: { token: 'mF_9.B5f-4.1JqM', tokenExpiresAt: 1_792_000_120_000 } },
  { type: 'locale', payload: { locale: 'en' } },
  { type: 'theme', payload: { accent: '#2357d9' } },
  { type: 'theme', payload: {} },
];

const VALID_EDITOR_MESSAGES: readonly EditorMessage[] = [
  { type: 'ready', payload: { version: 1 } },
  { type: 'token-request', payload: { reason: 'expiring' } },
  { type: 'token-request', payload: { reason: 'expired' } },
  {
    type: 'layout-changed',
    payload: {
      itemCount: 3,
      violationCount: 1,
      bom: {
        lines: [
          { partNumber: 'LE-SWG-1005', quantity: 2 },
          { partNumber: 'LE-UPS-1010', quantity: 1 },
        ],
        totalUsd: 19_500,
      },
    },
  },
  {
    type: 'layout-changed',
    payload: { itemCount: 0, violationCount: 0, bom: { lines: [], totalUsd: 0 } },
  },
  { type: 'resize', payload: { height: 812.5 } },
  { type: 'navigate', payload: { to: 'quote', projectId: 'nw-prj-2041' } },
  { type: 'error', payload: { code: 'token-expired', message: 'The access token expired.' } },
];

describe('envelope', () => {
  it('wraps a message with the protocol name and version', () => {
    expect(envelope({ type: 'locale', payload: { locale: 'en' } })).toEqual({
      protocol: 'cwx.layout-editor',
      version: 1,
      type: 'locale',
      payload: { locale: 'en' },
    });
  });

  it('round-trips every valid message through its parser', () => {
    for (const message of VALID_HOST_MESSAGES) {
      expect(parseHostMessage(envelope(message))).toEqual(message);
    }
    for (const message of VALID_EDITOR_MESSAGES) {
      expect(parseEditorMessage(envelope(message))).toEqual(message);
    }
  });

  it('recognises messages that claim this protocol', () => {
    expect(isProtocolMessage(envelope({ type: 'ready', payload: { version: 1 } }))).toBe(true);
    expect(isProtocolMessage({ protocol: PROTOCOL, version: 2, type: 'init' })).toBe(true);
    expect(isProtocolMessage({ protocol: 'other', type: 'init' })).toBe(false);
    expect(isProtocolMessage('cwx.layout-editor')).toBe(false);
    expect(isProtocolMessage([{ protocol: PROTOCOL }])).toBe(false);
    expect(isProtocolMessage(null)).toBe(false);
  });

  it('drops extra envelope fields and returns frozen copies', () => {
    const parsed = parseHostMessage({
      ...envelope({ type: 'init', payload: INIT }),
      sentAt: 1_792_000_000_000,
      replyTo: 'https://attacker.example',
    });

    expect(parsed).toEqual({ type: 'init', payload: INIT });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.payload)).toBe(true);
    if (parsed?.type !== 'init') throw new Error('Expected an init message');
    expect(Object.isFrozen(parsed.payload.user)).toBe(true);
    expect(Object.isFrozen(parsed.payload.theme)).toBe(true);
  });
});

describe('parseHostMessage', () => {
  it('rejects anything that is not a current-version envelope', () => {
    const valid = envelope({ type: 'locale', payload: { locale: 'en' } });
    for (const data of [
      null,
      undefined,
      'init',
      42,
      [],
      [valid],
      { ...valid, protocol: 'cwx.other' },
      { ...valid, version: 2 },
      { ...valid, version: '1' },
      { ...valid, type: 7 },
      { ...valid, type: 'unknown' },
      { ...valid, type: 'ready' },
      { ...valid, payload: null },
      { ...valid, payload: ['en'] },
      { ...valid, payload: 'en' },
    ]) {
      expect(parseHostMessage(data)).toBeNull();
    }
  });

  it('rejects init with missing, mistyped or oversized identity fields', () => {
    for (const changes of [
      { user: undefined },
      { user: 'Alex Morgan' },
      { user: { id: 'u-1', name: '' } },
      { user: { id: 'u-1', name: '   ' } },
      { user: { id: 'u-1', name: 'x'.repeat(LIMITS.name + 1) } },
      { user: { id: 'u-1', name: 'Alex\u0000Morgan' } },
      { user: { id: 'u-1', name: 'Alex\nMorgan' } },
      { user: { id: 'u-1', name: 'Alex\u0085Morgan' } },
      { user: { id: 'u-1', name: ' 　 ' } },
      { user: { id: 42, name: 'Alex' } },
      { project: { id: 'p'.repeat(LIMITS.id + 1), name: 'Room' } },
      { project: { name: 'Room' } },
      { locale: 'fr' },
      { locale: undefined },
    ]) {
      expect(parseHostMessage(initWith(changes))).toBeNull();
    }
  });

  it('accepts identity fields right at the length limits', () => {
    const longest = initWith({
      user: { id: 'u'.repeat(LIMITS.id), name: 'n'.repeat(LIMITS.name) },
    });
    expect(parseHostMessage(longest)).not.toBeNull();
  });

  it('accepts names in any script, with spaces between words', () => {
    const parsed = parseHostMessage(initWith({ user: { id: 'u-7', name: 'Nguyễn Văn An' } }));
    expect(parsed).toMatchObject({ payload: { user: { name: 'Nguyễn Văn An' } } });
    const decomposed = 'Nguyễn Văn An'.normalize('NFD');
    expect(parseHostMessage(initWith({ project: { id: 'p-7', name: decomposed } }))).toMatchObject({
      payload: { project: { name: decomposed } },
    });
  });

  it('rejects names with invisible, bidi, private-use or unpaired surrogate characters', () => {
    for (const name of [
      '\u200B',
      'Alex\u200BMorgan',
      '\u202Enagrom xelA',
      'Alex \u2067Morgan',
      '\uFEFFAlex Morgan',
      'Alex Morgan\uE000',
      'Alex Morgan\uD800',
    ]) {
      expect(parseHostMessage(initWith({ user: { id: 'u-1', name } }))).toBeNull();
      expect(parseHostMessage(initWith({ project: { id: 'p-1', name } }))).toBeNull();
    }
  });

  it('rejects empty, malformed or oversized tokens and non-integer expiry times', () => {
    for (const changes of [
      { token: '' },
      { token: 'has space' },
      { token: 'quote"inside' },
      { token: '=leading-padding' },
      { token: 'a'.repeat(LIMITS.token + 1) },
      { token: 12345 },
      { tokenExpiresAt: Number.NaN },
      { tokenExpiresAt: Number.POSITIVE_INFINITY },
      { tokenExpiresAt: -1 },
      { tokenExpiresAt: 0 },
      { tokenExpiresAt: 1.5 },
      { tokenExpiresAt: 2 ** 53 },
      { tokenExpiresAt: '1792000000000' },
      { tokenExpiresAt: undefined },
    ]) {
      expect(parseHostMessage(initWith(changes))).toBeNull();
    }
    for (const payload of [{ token: '', tokenExpiresAt: 1 }, { token: 'abc' }]) {
      expect(parseHostMessage(hostEnvelope('token', payload))).toBeNull();
    }
    expect(parseHostMessage(initWith({ token: 'a'.repeat(LIMITS.token) }))).not.toBeNull();
  });

  it('rejects malicious or out-of-range theme values', () => {
    for (const theme of [
      { accent: 'red' },
      { accent: '#fff' },
      { accent: '#12345g' },
      { accent: '#0b6aa2; background: url(https://attacker.example/t.gif)' },
      { accent: 'url(javascript:alert(1))' },
      { accent: 'expression(alert(1))' },
      { accent: 0x0b6aa2 },
      { fontFamily: 'Comic Sans MS' },
      { fontFamily: "system-ui; src: url('https://attacker.example/font.woff')" },
      { fontFamily: 'system-ui, serif' },
      { radius: -1 },
      { radius: LIMITS.radius + 0.5 },
      { radius: Number.NaN },
      { radius: Number.POSITIVE_INFINITY },
      { radius: '4px' },
      'dark',
      null,
    ]) {
      expect(parseHostMessage(hostEnvelope('theme', theme))).toBeNull();
      expect(parseHostMessage(initWith({ theme }))).toBeNull();
    }
    expect(parseHostMessage(hostEnvelope('theme', { radius: 0 }))).not.toBeNull();
    expect(parseHostMessage(hostEnvelope('theme', { radius: LIMITS.radius }))).not.toBeNull();
  });

  it('copies only known fields, so extra data never reaches the editor', () => {
    const parsed = parseHostMessage(
      initWith({
        isAdmin: true,
        user: { id: 'u-1042', name: 'Alex Morgan', email: 'alex@example.com' },
        theme: { accent: '#0b6aa2', css: 'body{display:none}' },
      }),
    );
    expect(parsed).toEqual({
      type: 'init',
      payload: {
        user: { id: 'u-1042', name: 'Alex Morgan' },
        project: INIT.project,
        locale: 'vi',
        token: INIT.token,
        tokenExpiresAt: INIT.tokenExpiresAt,
        theme: { accent: '#0b6aa2' },
      },
    });
    expect(JSON.stringify(parsed)).not.toMatch(/isAdmin|email|css/);
  });
});

describe('parseEditorMessage', () => {
  function editorEnvelope(type: string, payload: unknown) {
    return { protocol: PROTOCOL, version: PROTOCOL_VERSION, type, payload };
  }

  const summary = {
    itemCount: 3,
    violationCount: 1,
    bom: { lines: [{ partNumber: 'LE-SWG-1005', quantity: 3 }], totalUsd: 14_400 },
  };

  it('rejects host message types and unknown types', () => {
    expect(parseEditorMessage(envelope({ type: 'locale', payload: { locale: 'en' } }))).toBeNull();
    expect(parseEditorMessage(editorEnvelope('close', {}))).toBeNull();
  });

  it('rejects envelopes that lack a type or a payload', () => {
    expect(
      parseEditorMessage({ protocol: PROTOCOL, version: PROTOCOL_VERSION, type: 'ready' }),
    ).toBeNull();
    expect(
      parseEditorMessage({
        protocol: PROTOCOL,
        version: PROTOCOL_VERSION,
        payload: { version: 1 },
      }),
    ).toBeNull();
  });

  it('rejects invalid ready, token-request, resize, navigate and error payloads', () => {
    for (const [type, payload] of [
      ['ready', { version: 0 }],
      ['ready', { version: '1' }],
      ['ready', { version: 2 ** 53 }],
      ['resize', {}],
      ['token-request', { reason: 'soon' }],
      ['token-request', {}],
      ['resize', { height: -1 }],
      ['resize', { height: Number.NaN }],
      ['resize', { height: Number.POSITIVE_INFINITY }],
      ['resize', { height: LIMITS.height + 1 }],
      ['navigate', { to: 'checkout', projectId: 'p-1' }],
      ['navigate', { to: 'quote', projectId: '' }],
      ['navigate', { to: 'quote' }],
      ['error', { code: 'boom', message: 'Something broke' }],
      ['error', { code: 'init-timeout', message: '' }],
      ['error', { code: 'init-timeout', message: 'x'.repeat(LIMITS.errorMessage + 1) }],
    ] as const) {
      expect(parseEditorMessage(editorEnvelope(type, payload))).toBeNull();
    }
  });

  it('rejects layout summaries with impossible counts, lines or totals', () => {
    for (const payload of [
      { ...summary, itemCount: -1 },
      { ...summary, itemCount: 2.5 },
      { ...summary, itemCount: 2 ** 53 },
      { ...summary, bom: { lines: [{ partNumber: 'LE-SWG-1005', quantity: 1.5 }], totalUsd: 1 } },
      { ...summary, violationCount: Number.NaN },
      { ...summary, bom: null },
      { ...summary, bom: { lines: 'LE-SWG-1005', totalUsd: 1 } },
      { ...summary, bom: { lines: [], totalUsd: -5 } },
      { ...summary, bom: { lines: [], totalUsd: Number.POSITIVE_INFINITY } },
      { ...summary, bom: { lines: [{ partNumber: 'LE-SWG-1005', quantity: 0 }], totalUsd: 1 } },
      { ...summary, bom: { lines: [{ partNumber: '', quantity: 1 }], totalUsd: 1 } },
      {
        ...summary,
        bom: {
          lines: [{ partNumber: 'P'.repeat(LIMITS.partNumber + 1), quantity: 1 }],
          totalUsd: 1,
        },
      },
      {
        ...summary,
        bom: {
          lines: Array.from({ length: LIMITS.bomLines + 1 }, () => ({
            partNumber: 'P',
            quantity: 1,
          })),
          totalUsd: 1,
        },
      },
    ]) {
      expect(parseEditorMessage(editorEnvelope('layout-changed', payload))).toBeNull();
    }
  });
});
