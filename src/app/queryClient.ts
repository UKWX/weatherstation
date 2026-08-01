import { QueryClient } from '@tanstack/react-query'
import { defaultRetryDelay, shouldRetryPublicRequest } from '@/api/publicWeatherApi'

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryPublicRequest,
        retryDelay: defaultRetryDelay,
        refetchOnWindowFocus: false,
      },
    },
  })
}
