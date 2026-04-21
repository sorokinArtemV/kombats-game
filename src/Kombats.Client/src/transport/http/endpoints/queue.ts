import { httpClient } from '../client';
import type { QueueStatusResponse, LeaveQueueResponse } from '@/types/api';

export function join(): Promise<void> {
  return httpClient.post<void>('/api/v1/queue/join');
}

export function leave(): Promise<LeaveQueueResponse> {
  return httpClient.post<LeaveQueueResponse>('/api/v1/queue/leave');
}

export function getStatus(): Promise<QueueStatusResponse> {
  return httpClient.get<QueueStatusResponse>('/api/v1/queue/status');
}
