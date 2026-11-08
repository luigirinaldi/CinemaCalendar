import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import 'leaflet/dist/leaflet.css';
import SiteRouter from './SiteRouter';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <SiteRouter />
    </StrictMode>
);
