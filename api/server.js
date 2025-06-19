// api/server.js - Manual body parsing for Vercel

module.exports = async (req, res) => {
    console.log("EXECUTE: Method:", req.method);
    
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
    
    // Manually read the body
    let body;
    try {
        const buffers = [];
        for await (const chunk of req) {
            buffers.push(chunk);
        }
        const data = Buffer.concat(buffers).toString();
        console.log("Raw body received:", data);
        body = JSON.parse(data);
        console.log("Parsed body:", body);
    } catch (error) {
        console.error("Error parsing body:", error);
        return res.status(400).json({ success: false, error: "Invalid JSON in request body" });
    }
    
    if (!body || Object.keys(body).length === 0) {
        console.error("ERROR: Request body is empty");
        return res.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }

    const { action, params, webhook_url, request_id } = body;
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

    if (!ZAPIER_MCP_URL) {
        console.error("ERROR: Missing ZAPIER_MCP_URL environment variable");
        return res.status(500).json({ success: false, error: "Server configuration error - Missing ZAPIER_MCP_URL" });
    }
    
    if (!action || !webhook_url) {
        console.error("ERROR: Missing required fields");
        return res.status(400).json({ success: false, error: "Bad Request: Missing 'action' or 'webhook_url'" });
    }
    
    console.log("Processing request:", { action, request_id });
    
    try {
        console.log("Calling Zapier MCP at:", ZAPIER_MCP_URL);
        const zapierPayload = { action, params: params || {} };
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        
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
            const errorText = await zapierResponse.text();
            console.error("Zapier error response:", errorText);
            throw new Error(`Zapier MCP returned status ${zapierResponse.status}: ${errorText}`);
        }
        
        const zapierData = await zapierResponse.json();
        console.log("Zapier response received successfully");

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
        console.error("Error:", error.message);
        
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
