import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryBasePath = '/WakefieldStation/'

// https://vite.dev/config/
export default defineConfig({
  base: repositoryBasePath,
  plugins: [react()],
})
