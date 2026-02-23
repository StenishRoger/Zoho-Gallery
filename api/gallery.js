// Vercel Serverless Function — handles GET / POST / DELETE for /api/gallery
const fs   = require('fs');
const path = require('path');

const GALLERY_FILE = path.join(process.cwd(), 'gallery.json');

function readGalleryFile() {
    const raw = fs.readFileSync(GALLERY_FILE, 'utf-8');
    return JSON.parse(raw);
}

module.exports = (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // ── GET — return the full gallery.json ─────────────────────────────────
    if (req.method === 'GET') {
        try {
            const data = readGalleryFile();
            return res.status(200).json(data);
        } catch (err) {
            return res.status(500).json({ error: 'Could not read gallery.json' });
        }
    }

    // ── POST — add a new item ──────────────────────────────────────────────
    if (req.method === 'POST') {
        try {
            const { src, title, type } = req.body;

            if (!src || !title || !type) {
                return res.status(400).json({ error: 'Missing required fields: src, title, type' });
            }

            const data = readGalleryFile();
            const normalizedSrc = src.toLowerCase().trim();
            const exists = data.images.some(
                img => img.src.toLowerCase().trim() === normalizedSrc
            );
            if (exists) {
                return res.status(409).json({ error: 'An item with this URL already exists' });
            }

            data.images.unshift({ src, title, type });

            try {
                fs.writeFileSync(GALLERY_FILE, JSON.stringify(data, null, 4), 'utf-8');
            } catch {
                return res.status(503).json({
                    error: 'Cannot persist changes on serverless hosting. Use node server.js locally to add/delete items.'
                });
            }

            return res.status(201).json({ message: 'Item added successfully', item: { src, title, type } });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to add item' });
        }
    }

    // ── DELETE — remove an item by src ──────────────────────────────────────
    if (req.method === 'DELETE') {
        try {
            const { src } = req.body;

            if (!src) {
                return res.status(400).json({ error: 'Missing required field: src' });
            }

            const data = readGalleryFile();
            const normalizedSrc = src.toLowerCase().trim();
            const initialLength = data.images.length;

            data.images = data.images.filter(
                img => img.src.toLowerCase().trim() !== normalizedSrc
            );

            if (data.images.length === initialLength) {
                return res.status(404).json({ error: 'Item not found' });
            }

            try {
                fs.writeFileSync(GALLERY_FILE, JSON.stringify(data, null, 4), 'utf-8');
            } catch {
                return res.status(503).json({
                    error: 'Cannot persist changes on serverless hosting. Use node server.js locally to add/delete items.'
                });
            }

            return res.status(200).json({ message: 'Item deleted successfully' });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to delete item' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
