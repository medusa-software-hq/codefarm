import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Where `task gradle:runService` serves the service. */
const originUrl = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],

  server: {
    // Stands in for the Worker, which nobody signs in to locally, so it names a fixed caller
    proxy: {
      '/api/': {
        target: originUrl,
        rewrite: (path) => path.replace(/^\/api\//, '/impl/api/'),
        headers: {
          'x-codefarm-caller-subject': 'local-developer',
          'x-codefarm-caller-email': 'developer@localhost',
        },
      },
    },
  },
});
