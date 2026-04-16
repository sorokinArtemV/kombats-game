# Skill: Add TanStack Query Endpoint

Wire a BFF HTTP endpoint into the frontend via transport function + TanStack Query hook.

---

## When to Use

When adding a new API call to the BFF — whether a data fetch (query) or a mutation (create/update/delete).

---

## Steps

### 1. Define Types

Add request/response types to the appropriate file in `src/types/`:

```typescript
// src/types/api.ts (or domain-specific type file)
export interface GetSomethingResponse {
  id: string;
  name: string;
  // ... fields matching BFF response contract
}

export interface CreateSomethingRequest {
  name: string;
  // ... fields matching BFF request contract
}
```

### 2. Add Transport Function

Add the endpoint function in the correct domain file under `transport/http/endpoints/`:

```typescript
// src/transport/http/endpoints/{domain}.ts
import { httpClient } from '../client';
import type { GetSomethingResponse, CreateSomethingRequest } from '@/types/api';

export async function getSomething(id: string): Promise<GetSomethingResponse> {
  return httpClient.get<GetSomethingResponse>(`/api/v1/something/${id}`);
}

export async function createSomething(data: CreateSomethingRequest): Promise<void> {
  return httpClient.post('/api/v1/something', data);
}
```

Rules:
- Functions are plain `async` functions, not class methods
- Return typed responses — never `any`
- No error handling in transport (throw on non-2xx; consumer handles)
- No auth token injection here — `client.ts` does that
- No caching, retries, or state management

### 3. Define Query Key Factory

Add or extend the key factory (co-located with hooks or in a shared keys file):

```typescript
// src/modules/{module}/hooks.ts (or keys.ts if many)
export const somethingKeys = {
  all: ['something'] as const,
  detail: (id: string) => [...somethingKeys.all, id] as const,
  list: () => [...somethingKeys.all, 'list'] as const,
};
```

### 4. Create Query Hook (for GET)

```typescript
// src/modules/{module}/hooks.ts
import { useQuery } from '@tanstack/react-query';
import { getSomething } from '@/transport/http/endpoints/{domain}';

export function useSomething(id: string) {
  return useQuery({
    queryKey: somethingKeys.detail(id),
    queryFn: () => getSomething(id),
    staleTime: 30_000, // Adjust per data freshness needs
    enabled: !!id, // Don't fetch if id is empty
  });
}
```

### 5. Create Mutation Hook (for POST/PUT/DELETE)

```typescript
// src/modules/{module}/hooks.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSomething } from '@/transport/http/endpoints/{domain}';

export function useCreateSomething() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSomethingRequest) => createSomething(data),
    onSuccess: () => {
      // Invalidate related queries to refetch
      queryClient.invalidateQueries({ queryKey: somethingKeys.all });
    },
  });
}
```

### 6. Handle Specific HTTP Errors

For endpoints with known error responses (409 revision mismatch, 400 validation):

```typescript
export function useAllocateStats() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AllocateStatsRequest) => allocateStats(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.state() });
    },
    onError: (error: ApiError) => {
      if (error.status === 409) {
        // Revision mismatch — refetch and let user retry
        queryClient.invalidateQueries({ queryKey: gameKeys.state() });
      }
    },
  });
}
```

### 7. Use in Component

```typescript
function SomeScreen() {
  const { data, isLoading, error } = useSomething(id);
  const createMutation = useCreateSomething();

  if (isLoading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div>
      <SomeDisplay data={data} />
      <Button onClick={() => createMutation.mutate(formData)}>
        Create
      </Button>
    </div>
  );
}
```

---

## Stale Time Guidelines

| Data Type | Stale Time | Reason |
|-----------|-----------|--------|
| Game state | `0` | Always refetch — guards depend on fresh data |
| Player card | `30_000` (30s) | Rarely changes, acceptable staleness |
| Chat conversations | `10_000` (10s) | New conversations appear via SignalR |
| Chat message history | `60_000` (1min) | Historical, rarely changes |
| Queue status | N/A (polling) | Not TanStack Query — uses polling |
| Battle state | N/A (SignalR) | Not TanStack Query — uses Zustand |

---

## Checklist

- [ ] Types in `types/` matching BFF contract
- [ ] Transport function in `transport/http/endpoints/{domain}.ts`
- [ ] Transport function is plain async — no React, no state
- [ ] Query key factory defined with consistent structure
- [ ] `useQuery` hook for reads with appropriate `staleTime`
- [ ] `useMutation` hook for writes with `onSuccess` invalidation
- [ ] Error handling for known error codes (409, 400)
- [ ] Component uses hook — never calls transport directly
- [ ] No `useEffect` for data fetching
