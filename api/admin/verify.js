// Vercel Serverless Function — handles POST for /api/admin/verify
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zoho@admin';

module.exports = (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, error: 'No password provided' });
        }

        if (password === ADMIN_PASSWORD) {
            return res.status(200).json({ success: true, message: 'Admin access granted' });
        } else {
            return res.status(401).json({ success: false, error: 'Incorrect password' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Verification failed' });
    }
};
