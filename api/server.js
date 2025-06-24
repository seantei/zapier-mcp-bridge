// api/server.js
module.exports = async (req, res) => {
    console.log("EXECUTE: Method:", req.method);

    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).json({ status: 'healthy', message: 'Zapier MCP Bridge is running' });
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

    // Parse body manually
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

    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;
    if (!ZAPIER_MCP_URL) return res.status(500).json({ success: false, error: "Server configuration error - Missing ZAPIER_MCP_URL" });

    // Optionally forward webhook_url for async notification
    const webhook_url = body.webhook_url;
    if (webhook_url) delete body.webhook_url;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        // Forward JSON-RPC body as-is
        const zapierResp = await fetch(ZAPIER_MCP_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!zapierResp.ok) {
            const errText = await zapierResp.text();
            throw new Error(`Zapier MCP error ${zapierResp.status}: ${errText}`);
        }

        const zapierData = await zapierResp.json();

        // Notify webhook, if present
        if (webhook_url) {
            const webhookPayload = {
                success: true,
                id: body.id || null,
                result: zapierData
            };

            fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload)
            }).then(() => console.log("Webhook sent successfully"))
              .catch(e => console.error("Webhook error:", e.message));
        }

        return res.status(200).json({ success: true, message: 'Request processed successfully', id: body.id || null });

    } catch (error) {
        console.error("Zapier MCP Error:", error.message);

        if (webhook_url) {
            const errorPayload = {
                success: false,
                id: body.id || null,
                error: error.message
            };
            fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorPayload)
            }).catch(e => console.error("Webhook error:", e.message));
        }

        return res.status(500).json({ success: false, error: "Failed to process request", message: error.message });
    }
};
