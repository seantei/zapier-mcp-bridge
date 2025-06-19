// server.js - Version 12 (Fixed for Vercel's body parsing)
const axios = require('axios');

// This is the main handler function that Vercel will call.
module.exports = async (request, response) => {
    console.log("V12 EXECUTE: Function invoked. Method:", request.method);
    
    // Set CORS headers if needed
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    
    if (request.method === 'GET' && request.url.includes('/health')) {
        return response.status(200).json({ status: 'healthy', version: '12' });
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    
    // Vercel should parse the body automatically, but let's handle both cases
    let body = request.body;
    
    // Log what we received
    console.log("V12 DEBUG: Type of request.body:", typeof request.body);
    console.log("V12 DEBUG: request.body:", JSON.stringify(request.body, null, 2));
    
    // If body is a string, parse it
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            console.error("V12 ERROR: Failed to parse body string:", e.message);
            return response.status(400).json({ success: false, error: "Invalid JSON in request body" });
        }
    }
    
    if (!body || Object.keys(body).length === 0) {
        console.error("V12 FATAL: Request body is missing or empty after parsing.");
        return response.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }

    const { action, params, webhook_url, request_id } = body;
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

    if (!ZAPIER_MCP_URL) {
        console.error("V12 FATAL: Missing Zapier MCP URL environment variable.");
        return response.status(500).json({ success: false, error: "Server configuration error." });
    }
    if (!action || !webhook_url) {
        console.error(`V12 FATAL: Missing 'action' or 'webhook_url' in request body.`);
        return response.status(400).json({ success: false, error: "Bad Request: Missing required fields in body." });
    }
    
    console.log("V12 INFO: Processing action:", action, "with params:", params);
    
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
        
        axios.post(webhook_url, webhookPayload).catch(err => console.error("V12 WEBHOOK ERROR:", err.message));
        return response.status(200).json({ success: true, message: 'Processed successfully.' });

    } catch (error) {
        console.error("V12 ZAPIER ERROR:", error.message);
        const errorDetails = {
            success: false,
            request_id: request_id,
            error: 'Failed during Zapier MCP request.',
            message: error.message,
            details: error.response ? error.response.data : 'No response data'
        };
        
        axios.post(webhook_url, errorDetails).catch(err => console.error("V12 WEBHOOK ERROR:", err.message));
        return response.status(500).json(errorDetails);
    }
};
