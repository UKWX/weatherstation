import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRouter } from '@/app/router'
import { createAppQueryClient } from '@/app/queryClient'
import { ThemeProvider } from '@/app/theme'

const queryClient = createAppQueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter basename="/weatherstation">
          <AppRouter />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
