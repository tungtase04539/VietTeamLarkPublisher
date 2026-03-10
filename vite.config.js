import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    server: {
        proxy: {
            '/lark-api': {
                target: 'https://open.larksuite.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/lark-api/, ''); },
                secure: true,
            },
        },
    },
});
