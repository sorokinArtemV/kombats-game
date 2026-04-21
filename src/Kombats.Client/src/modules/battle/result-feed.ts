import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { battleKeys } from '@/app/query-client';
import * as battleApi from '@/transport/http/endpoints/battle';
import { useBattleFeed } from './hooks';
import { mergeFeeds } from './feed-merge';

/**
 * Merge the live (in-store) battle feed with the authoritative HTTP feed
 * for the post-battle result screen. HTTP feed is fetched once per battleId
 * (staleTime: Infinity — it's deterministic for a finished battle).
 */
export function useResultBattleFeed(battleId: string | null) {
  const storeEntries = useBattleFeed();

  const query = useQuery({
    queryKey: battleId ? battleKeys.feed(battleId) : battleKeys.all,
    queryFn: () => battleApi.getFeed(battleId as string),
    enabled: !!battleId,
    staleTime: Infinity,
    retry: 1,
  });

  const merged = useMemo(
    () => mergeFeeds(storeEntries, query.data?.entries ?? []),
    [storeEntries, query.data],
  );

  return {
    entries: merged,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}
