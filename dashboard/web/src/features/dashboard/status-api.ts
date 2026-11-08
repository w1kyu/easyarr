import type { LogSource, StatusView } from '@easyarr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '~/lib/api';

export const STATUS_QUERY_KEY = ['status'] as const;

/** The home screen polls every 5 s while visible (the server caches probes for 4 s). */
export function useStatus() {
  return useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: api.status,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

/** Simple/Advanced: shown at once, saved on the server so every device remembers it. */
export function useSetMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mode: StatusView['mode']) => api.setMode(mode),
    onMutate: (mode) => {
      client.setQueryData<StatusView>(STATUS_QUERY_KEY, (old) => (old ? { ...old, mode } : old));
    },
    onSettled: () => void client.invalidateQueries({ queryKey: STATUS_QUERY_KEY }),
  });
}

export function useLog(source: LogSource | null) {
  return useQuery({
    queryKey: ['log', source],
    queryFn: () => api.log(source as LogSource),
    enabled: source !== null,
    refetchInterval: 10_000,
  });
}
