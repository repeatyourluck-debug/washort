import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';
import redirectRoutes from './routes/redirect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);

// Redirect Routes (must come last to not swallow /api and /public requests)
app.use('/', redirectRoutes);

// Catch-all to send to 404 handled in redirect normally, but if explicitly hitting /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Shortlink server running on http://localhost:${PORT}`);
});
