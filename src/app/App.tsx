import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRouter } from '@/app/router'
import { createAppQueryClient } from '@/app/queryClient'

const queryClient = createAppQueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/weatherstation">
        <AppRouter />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
