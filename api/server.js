// api/server.js
const axios = require('axios');

module.exports = async (req, res) => {
    console.log("EXECUTE: Method:", req.method);
    console.log("EXECUTE: Headers:", req.headers);
    console.log("EXECUTE: Body:", req.body);
    
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'healthy', message: 'Zapier MCP Bridge is running' });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    
    const body = req.body;
    
    if (!body || Object.keys(body).length === 0) {
        console.error("ERROR: Request body is empty");
        return res.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }

    const { action, params, webhook_url, request_id } = body;
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

    if (!ZAPIER_MCP_URL) {
        console.error("ERROR: Missing ZAPIER_MCP_URL environment variable");
        return res.status(500).json({ success: false, error: "Server configuration error." });
    }
    
    if (!action || !webhook_url) {
        console.error("ERROR: Missing required fields");
        return res.status(400).json({ success: false, error: "Bad Request: Missing 'action' or 'webhook_url'" });
    }
    
    try {
        console.log("Calling Zapier MCP with action:", action);
        const zapierPayload = { action, params: params || {} };
        const zapierResponse = await axios.post(ZAPIER_MCP_URL, zapierPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            }
        });

        const webhookPayload = {
            success: true,
            request_id: request_id,
            result: zapierResponse.data
        };
        
        // Send to webhook asynchronously
        axios.post(webhook_url, webhookPayload)
            .then(() => console.log("Webhook sent successfully"))
            .catch(err => console.error("Webhook error:", err.message));
            
        return res.status(200).json({ success: true, message: 'Request processed successfully' });

    } catch (error) {
        console.error("Zapier MCP Error:", error.message);
        const errorPayload = {
            success: false,
            request_id: request_id,
            error: error.message
        };
        
        // Send error to webhook
        axios.post(webhook_url, errorPayload).catch(err => console.error("Webhook error:", err.message));
        
        return res.status(500).json({ success: false, error: "Failed to process request" });
    }
};
