import { config } from '@/config';
import type { ApiError } from '@/types/api';

const BASE_URL = config.bff.baseUrl;

// ---------------------------------------------------------------------------
// Dependency injection — wired by app/ layer at startup
// ---------------------------------------------------------------------------

let _getAccessToken: () => string | null = () => null;
let _onAuthFailure: () => void = () => {};

export function configureHttpClient(deps: {
  getAccessToken: () => string | null;
  onAuthFailure: () => void;
}): void {
  _getAccessToken = deps.getAccessToken;
  _onAuthFailure = deps.onAuthFailure;
}

// ---------------------------------------------------------------------------
// Error parsing
// ---------------------------------------------------------------------------

async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    if (body?.error) {
      return {
        error: {
          code: body.error.code ?? 'unknown',
          message: body.error.message ?? response.statusText,
          details: body.error.details,
        },
        status: response.status,
      };
    }
  } catch {
    // Response body is not JSON — fall through to generic error
  }

  return {
    error: {
      code: 'unknown',
      message: response.statusText || `HTTP ${response.status}`,
    },
    status: response.status,
  };
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = _getAccessToken();

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };

  if (init?.body !== undefined && init?.body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    _onAuthFailure();
    throw await parseErrorResponse(response);
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  // 204 No Content — return undefined as T
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const httpClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' });
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};
