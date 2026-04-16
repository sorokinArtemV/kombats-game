import { RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import { queryClient } from './query-client';
import { router } from './router';
import './transport-init';

export function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>
  );
}
