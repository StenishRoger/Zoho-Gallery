// ============================================================================
// SIMPLE NODE.JS SERVER FOR GALLERY CRUD
// No external dependencies — uses built-in http, fs, path modules
// Run:  node server.js
// Then visit:  http://localhost:3000
// ============================================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const GALLERY_FILE = path.join(__dirname, 'gallery.json');

// ── Admin Password ───────────────────────────────────────────────────────────
// Change this password to whatever you want. Only people who know this
// password can enable admin mode (which allows deleting gallery items).
const ADMIN_PASSWORD = 'zoho@admin';

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
    '.ico':  'image/x-icon'
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function readGalleryFile() {
    const raw = fs.readFileSync(GALLERY_FILE, 'utf-8');
    return JSON.parse(raw);
}

function writeGalleryFile(data) {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify(data, null, 4), 'utf-8');
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

// ── API Handlers ─────────────────────────────────────────────────────────────

/** GET /api/gallery — return the full gallery.json */
function handleGetGallery(req, res) {
    try {
        const data = readGalleryFile();
        sendJSON(res, 200, data);
    } catch (err) {
        sendJSON(res, 500, { error: 'Could not read gallery.json' });
    }
}

/** POST /api/gallery — add a new item to gallery.json images array */
async function handleAddItem(req, res) {
    try {
        const { src, title, type } = await parseBody(req);

        if (!src || !title || !type) {
            return sendJSON(res, 400, { error: 'Missing required fields: src, title, type' });
        }

        const data = readGalleryFile();

        // Check for duplicates
        const normalizedSrc = src.toLowerCase().trim();
        const exists = data.images.some(
            img => img.src.toLowerCase().trim() === normalizedSrc
        );
        if (exists) {
            return sendJSON(res, 409, { error: 'An item with this URL already exists' });
        }

        // Prepend new item at the beginning so it shows first
        data.images.unshift({ src, title, type });
        writeGalleryFile(data);

        sendJSON(res, 201, { message: 'Item added successfully', item: { src, title, type } });
    } catch (err) {
        console.error('Add item error:', err);
        sendJSON(res, 500, { error: 'Failed to add item' });
    }
}

/** POST /api/admin/verify — verify admin password */
async function handleAdminVerify(req, res) {
    try {
        const { password } = await parseBody(req);

        if (!password) {
            return sendJSON(res, 400, { success: false, error: 'No password provided' });
        }

        if (password === ADMIN_PASSWORD) {
            sendJSON(res, 200, { success: true, message: 'Admin access granted' });
        } else {
            sendJSON(res, 401, { success: false, error: 'Incorrect password' });
        }
    } catch (err) {
        console.error('Admin verify error:', err);
        sendJSON(res, 500, { success: false, error: 'Verification failed' });
    }
}

/** DELETE /api/gallery — remove an item from gallery.json by src */
async function handleDeleteItem(req, res) {
    try {
        const { src } = await parseBody(req);

        if (!src) {
            return sendJSON(res, 400, { error: 'Missing required field: src' });
        }

        const data = readGalleryFile();
        const normalizedSrc = src.toLowerCase().trim();
        const initialLength = data.images.length;

        data.images = data.images.filter(
            img => img.src.toLowerCase().trim() !== normalizedSrc
        );

        if (data.images.length === initialLength) {
            return sendJSON(res, 404, { error: 'Item not found' });
        }

        writeGalleryFile(data);
        sendJSON(res, 200, { message: 'Item deleted successfully' });
    } catch (err) {
        console.error('Delete item error:', err);
        sendJSON(res, 500, { error: 'Failed to delete item' });
    }
}

// ── Static File Server ───────────────────────────────────────────────────────

function serveStaticFile(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
}

// ── Request Router ───────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    // CORS headers (for development)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const url = req.url.split('?')[0]; // strip query string

    // API routes
    if (url === '/api/gallery') {
        switch (req.method) {
            case 'GET':    return handleGetGallery(req, res);
            case 'POST':   return handleAddItem(req, res);
            case 'DELETE': return handleDeleteItem(req, res);
            default:
                return sendJSON(res, 405, { error: 'Method not allowed' });
        }
    }

    if (url === '/api/admin/verify' && req.method === 'POST') {
        return handleAdminVerify(req, res);
    }

    // Everything else — serve static files
    serveStaticFile(req, res);
});

server.listen(PORT, () => {
    console.log(`\n  🖼️  Gallery server running at http://localhost:${PORT}\n`);
});
