import { QueryClient } from '@tanstack/react-query';

export const ASSISTANT_REPLY_KEY = ['assistant', 'reply'] as const;

export function createQueryClient(): QueryClient {
  const client = new QueryClient();
  client.setMutationDefaults(ASSISTANT_REPLY_KEY, { networkMode: 'always' });
  return client;
}
