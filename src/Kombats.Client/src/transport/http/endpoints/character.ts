import { httpClient } from '../client';
import type {
  SetCharacterNameRequest,
  AllocateStatsRequest,
  AllocateStatsResponse,
} from '@/types/api';

export function setName(data: SetCharacterNameRequest): Promise<void> {
  return httpClient.post<void>('/api/v1/character/name', data);
}

export function allocateStats(data: AllocateStatsRequest): Promise<AllocateStatsResponse> {
  return httpClient.post<AllocateStatsResponse>('/api/v1/character/stats', data);
}
