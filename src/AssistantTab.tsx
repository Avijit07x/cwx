import { QueryClientProvider } from '@tanstack/react-query';
import { AssistantPanel } from './features/assistant/AssistantPanel';
import { createQueryClient } from './state/queryClient';

const queryClient = createQueryClient();

export default function AssistantTab() {
  return (
    <QueryClientProvider client={queryClient}>
      <AssistantPanel />
    </QueryClientProvider>
  );
}
