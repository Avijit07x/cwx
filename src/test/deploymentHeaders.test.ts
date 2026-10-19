import 'sonner';
import { describe, expect, it } from 'vitest';
import deploymentHeaders from '../../public/_headers?raw';

function headersFor(path: string): ReadonlyMap<string, string> {
  const block = deploymentHeaders
    .trim()
    .split(/\n\s*\n/)
    .find((rule) => rule.split('\n')[0] === path);
  const lines = block?.split('\n').slice(1) ?? [];
  return new Map(
    lines.map((line) => {
      const separator = line.indexOf(': ');
      return [line.slice(0, separator).trim(), line.slice(separator + 2)];
    }),
  );
}

async function hashSource(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
}

describe('public/_headers', () => {
  it('gives the editor page a strict policy that allows only the stylesheet Sonner injects', async () => {
    const sonnerStyles = [...document.head.querySelectorAll('style')]
      .map((style) => style.textContent)
      .filter((text) => text.includes('[data-sonner-toaster]'));
    expect(sonnerStyles).toHaveLength(1);
    const allowedStyles = await Promise.all(['', ...sonnerStyles].map(hashSource));
    const policy = headersFor('/').get('Content-Security-Policy') ?? '';
    expect(headersFor('/index.html').get('Content-Security-Policy')).toBe(policy);
    expect(policy.split('; ')).toEqual(
      expect.arrayContaining([
        "default-src 'none'",
        "script-src 'self'",
        `style-src 'self' ${allowedStyles.join(' ')}`,
        "frame-ancestors 'self'",
      ]),
    );
  });

  it('sends nosniff and a referrer policy everywhere, keeps hashed assets and revalidates the page', () => {
    expect(headersFor('/*')).toEqual(
      new Map([
        ['X-Content-Type-Options', 'nosniff'],
        ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ]),
    );
    expect(headersFor('/assets/*').get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(headersFor('/').get('Cache-Control')).toBe('no-cache');
    expect(headersFor('/index.html').get('Cache-Control')).toBe('no-cache');
  });
});
