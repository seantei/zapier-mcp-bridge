// api/server.js - Using native fetch instead of axios

// Disable body parsing so we control it
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
};

module.exports = async (req, res) => {
    console.log("EXECUTE: Method:", req.method);
    console.log("EXECUTE: Headers:", JSON.stringify(req.headers, null, 2));
    console.log("EXECUTE: Body:", req.body);
    console.log("EXECUTE: Body type:", typeof req.body);
    
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
    
    // Get the body - it should already be parsed by Vercel
    let body = req.body;
    
    // If body is a string, try to parse it
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            console.error("ERROR: Failed to parse body string");
            return res.status(400).json({ success: false, error: "Invalid JSON in request body" });
        }
    }
    
    // Debug logging
    console.log("EXECUTE: Parsed body:", JSON.stringify(body, null, 2));
    
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
        console.error("ERROR: Request body is empty or invalid");
        console.error("Body value:", body);
        console.error("Body type:", typeof body);
        return res.status(400).json({ success: false, error: "Bad Request: Request body is empty or invalid." });
    }

    const { action, params, webhook_url, request_id } = body;
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

    if (!ZAPIER_MCP_URL) {
        console.error("ERROR: Missing ZAPIER_MCP_URL environment variable");
        return res.status(500).json({ success: false, error: "Server configuration error - Missing ZAPIER_MCP_URL" });
    }
    
    if (!action || !webhook_url) {
        console.error("ERROR: Missing required fields");
        console.error("Received fields:", { action, webhook_url, request_id });
        return res.status(400).json({ success: false, error: "Bad Request: Missing 'action' or 'webhook_url'" });
    }
    
    console.log("Processing request:", { action, request_id });
    
    try {
        console.log("Calling Zapier MCP with action:", action);
        console.log("ZAPIER_MCP_URL:", ZAPIER_MCP_URL);
        
        const zapierPayload = { action, params: params || {} };
        
        // Use native fetch instead of axios
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
        
        const zapierResponse = await fetch(ZAPIER_MCP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(zapierPayload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!zapierResponse.ok) {
            throw new Error(`Zapier MCP returned status ${zapierResponse.status}`);
        }
        
        const zapierData = await zapierResponse.json();
        console.log("Zapier response received:", zapierResponse.status);

        const webhookPayload = {
            success: true,
            request_id: request_id || 'no-id',
            result: zapierData
        };
        
        // Send to webhook asynchronously
        console.log("Sending webhook to:", webhook_url);
        fetch(webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
        }).then(() => console.log("Webhook sent successfully"))
          .catch(err => console.error("Webhook error:", err.message));
            
        return res.status(200).json({ 
            success: true, 
            message: 'Request processed successfully',
            request_id: request_id || 'no-id'
        });

    } catch (error) {
        console.error("Zapier MCP Error:", error.message);
        
        const errorPayload = {
            success: false,
            request_id: request_id || 'no-id',
            error: error.message
        };
        
        // Send error to webhook
        if (webhook_url) {
            fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorPayload)
            }).catch(err => console.error("Webhook error:", err.message));
        }
        
        return res.status(500).json({ 
            success: false, 
            error: "Failed to process request",
            message: error.message 
        });
    }
};
