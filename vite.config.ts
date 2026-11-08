import { defineConfig } from 'vite';

const proxy = {
    '/builder-api': { target: 'http://127.0.0.1:8788', changeOrigin: false },
};
export default defineConfig({
    base: '/CinemaCalendar/',
    server: { proxy, watch: { ignored: ['**/.scraper-debug/**'] } },
    preview: { proxy },
});
