import * as z from 'zod/mini';
import { LOCALES } from '../i18n/locales';

export const PROTOCOL = 'cwx.layout-editor';
export const PROTOCOL_VERSION = 1;

export const LIMITS = {
  id: 255,
  name: 120,
  token: 8192,
  partNumber: 64,
  bomLines: 500,
  errorMessage: 500,
  radius: 12,
  height: 100_000,
} as const;

const VISIBLE_CHARACTER = /\S/;
const NO_INVISIBLE_CHARACTERS = /^[^\p{Cc}\p{Cf}\p{Co}\p{Cs}]*$/u;
const BEARER_TOKEN = /^[\w.~+/-]+=*$/;
const HEX_COLOUR = /^#[\da-f]{6}$/i;

function text(max: number) {
  return z
    .string()
    .check(z.maxLength(max), z.regex(VISIBLE_CHARACTER), z.regex(NO_INVISIBLE_CHARACTERS));
}

function between(min: number, max: number) {
  return z.number().check(z.minimum(min), z.maximum(max));
}

const count = z.int().check(z.nonnegative());
const positiveInteger = z.int().check(z.positive());
const locale = z.enum(LOCALES);

const themeFont = z.enum(['IBM Plex Sans', 'system-ui', 'Segoe UI', 'Roboto', 'Noto Sans']);
const editorErrorCode = z.enum([
  'init-timeout',
  'token-expired',
  'invalid-message',
  'theme-rejected',
  'crashed',
]);

const identity = z.readonly(z.object({ id: text(LIMITS.id), name: text(LIMITS.name) }));

const theme = z.readonly(
  z.object({
    accent: z.optional(z.string().check(z.regex(HEX_COLOUR))),
    fontFamily: z.optional(themeFont),
    radius: z.optional(between(0, LIMITS.radius)),
  }),
);

const tokenGrantShape = {
  token: z.string().check(z.maxLength(LIMITS.token), z.regex(BEARER_TOKEN)),
  tokenExpiresAt: positiveInteger,
};

const tokenGrant = z.readonly(z.object(tokenGrantShape));

const initPayload = z.readonly(
  z.object({
    ...tokenGrantShape,
    user: identity,
    project: identity,
    locale,
    theme: z.optional(theme),
  }),
);

const bomLine = z.readonly(
  z.object({ partNumber: text(LIMITS.partNumber), quantity: positiveInteger }),
);

const layoutSummary = z.readonly(
  z.object({
    itemCount: count,
    violationCount: count,
    bom: z.readonly(
      z.object({
        lines: z.readonly(z.array(bomLine).check(z.maxLength(LIMITS.bomLines))),
        totalUsd: between(0, Number.MAX_SAFE_INTEGER),
      }),
    ),
  }),
);

function messageSchema<T extends string, P extends z.ZodMiniType>(type: T, payload: P) {
  return z.readonly(z.object({ type: z.literal(type), payload }));
}

function payloadOf<S extends z.core.$ZodShape>(shape: S) {
  return z.readonly(z.object(shape));
}

const hostMessage = z.discriminatedUnion('type', [
  messageSchema('init', initPayload),
  messageSchema('token', tokenGrant),
  messageSchema('locale', payloadOf({ locale })),
  messageSchema('theme', theme),
]);

const editorMessage = z.discriminatedUnion('type', [
  messageSchema('ready', payloadOf({ version: positiveInteger })),
  messageSchema('token-request', payloadOf({ reason: z.enum(['expiring', 'expired']) })),
  messageSchema('layout-changed', layoutSummary),
  messageSchema('resize', payloadOf({ height: between(0, LIMITS.height) })),
  messageSchema('navigate', payloadOf({ to: z.literal('quote'), projectId: text(LIMITS.id) })),
  messageSchema('error', payloadOf({ code: editorErrorCode, message: text(LIMITS.errorMessage) })),
]);

const claimsProtocol = z.object({ protocol: z.literal(PROTOCOL) });
const currentEnvelope = z.object({
  protocol: z.literal(PROTOCOL),
  version: z.literal(PROTOCOL_VERSION),
});

export type ThemeFont = z.infer<typeof themeFont>;
export type EditorErrorCode = z.infer<typeof editorErrorCode>;
export type Identity = z.infer<typeof identity>;
export type Theme = z.infer<typeof theme>;
export type TokenGrant = z.infer<typeof tokenGrant>;
export type InitPayload = z.infer<typeof initPayload>;
export type LayoutSummary = z.infer<typeof layoutSummary>;
export type HostMessage = z.infer<typeof hostMessage>;
export type EditorMessage = z.infer<typeof editorMessage>;

export function envelope(message: HostMessage | EditorMessage) {
  return { protocol: PROTOCOL, version: PROTOCOL_VERSION, ...message };
}

export function isProtocolMessage(data: unknown): boolean {
  return claimsProtocol.safeParse(data).success;
}

function parseCurrentVersion<T>(schema: z.ZodMiniType<T>, data: unknown): T | null {
  if (!currentEnvelope.safeParse(data).success) return null;
  return schema.safeParse(data).data ?? null;
}

export function parseHostMessage(data: unknown): HostMessage | null {
  return parseCurrentVersion(hostMessage, data);
}

export function parseEditorMessage(data: unknown): EditorMessage | null {
  return parseCurrentVersion(editorMessage, data);
}
