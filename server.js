// server.js - Version 11 (Fixed body parsing)
const axios = require('axios');

// Helper function to parse body
async function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (error) {
                resolve(null);
            }
        });
        req.on('error', reject);
    });
}

// This is the main handler function that Vercel will call.
module.exports = async (request, response) => {
    console.log("V11 EXECUTE: Function invoked. Method:", request.method);
    
    if (request.method === 'GET' && request.url.includes('/health')) {
        return response.status(200).json({ status: 'healthy', version: '11' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    
    // Parse the body manually
    const body = await parseBody(request);
    console.log("V11 EXECUTE: Parsed body:", JSON.stringify(body, null, 2));
    
    if (!body || Object.keys(body).length === 0) {
        console.error("V11 FATAL: Request body is missing or empty.");
        return response.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }

    const { action, params, webhook_url, request_id } = body;
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

    if (!ZAPIER_MCP_URL) {
        console.error("V11 FATAL: Missing Zapier MCP URL environment variable.");
        return response.status(500).json({ success: false, error: "Server configuration error." });
    }
    if (!action || !webhook_url) {
        console.error(`V11 FATAL: Missing 'action' or 'webhook_url' in request body.`);
        return response.status(400).json({ success: false, error: "Bad Request: Missing required fields in body." });
    }
    
    try {
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
        
        axios.post(webhook_url, webhookPayload).catch(err => console.error("V11 WEBHOOK ERROR:", err.message));
        return response.status(200).json({ success: true, message: 'Processed successfully.' });

    } catch (error) {
        console.error("V11 ZAPIER ERROR:", error.message);
        const errorDetails = {
            success: false,
            request_id: request_id,
            error: 'Failed during Zapier MCP request.',
            message: error.message,
            details: error.response ? error.response.data : 'No response data'
        };
        
        axios.post(webhook_url, errorDetails).catch(err => console.error("V11 WEBHOOK ERROR:", err.message));
        return response.status(500).json(errorDetails);
    }
};
