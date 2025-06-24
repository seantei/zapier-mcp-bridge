// api/server.js
// No external dependencies—uses built-in fetch

module.exports = async (req, res) => {
    console.log("EXECUTE: Method:", req.method);

    // --- 1. Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).json({ status: 'healthy', message: 'Zapier MCP Bridge is running' });
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

    // --- 2. Manually Parse the Body
    let body;
    try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        const rawData = Buffer.concat(buffers).toString();
        console.log("Raw body received:", rawData);
        body = JSON.parse(rawData);
        console.log("Parsed body:", body);
    } catch (err) {
        console.error("Error parsing body:", err);
        return res.status(400).json({ success: false, error: "Invalid JSON in request body" });
    }

    if (!body || Object.keys(body).length === 0) {
        console.error("ERROR: Request body is empty");
        return res.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }

    // --- 3. Ready to forward to Zapier MCP
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;
    if (!ZAPIER_MCP_URL) return res.status(500).json({ success: false, error: "Server configuration error - Missing ZAPIER_MCP_URL" });

    // Optional: Support webhook_url passthrough for post-processing (not needed by Zapier MCP)
    const webhook_url = body.webhook_url;
    if (webhook_url) delete body.webhook_u
