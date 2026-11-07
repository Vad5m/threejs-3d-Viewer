import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'three/addons/': path.resolve(__dirname, 'node_modules/three/examples/jsm/')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
