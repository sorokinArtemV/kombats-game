import { httpClient } from '../client';
import type { BattleFeedResponse } from '@/types/battle';

export function getFeed(battleId: string): Promise<BattleFeedResponse> {
  return httpClient.get<BattleFeedResponse>(`/api/v1/battles/${battleId}/feed`);
}
