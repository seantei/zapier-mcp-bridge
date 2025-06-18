// server.js - Version 10.1 (Native Vercel Serverless Function)
const axios = require('axios');

// This is the main handler function that Vercel will call.
// It no longer uses the express framework (req, res, app, etc.).
module.exports = async (request, response) => {
    // Vercel automatically parses the body for POST requests. It's directly available.
    const body = request.body;
    console.log("V10 EXECUTE: Function invoked. Request body:", JSON.stringify(body, null, 2));

    // Health check - if the request is a GET, respond with status.
    if (request.method === 'GET' && request.url.includes('/health')) {
        return response.status(200).json({ status: 'healthy', version: '10' });
    }

    // Only allow POST requests for the main logic
    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, error: 'Method Not Allowed' });
    }
    
    // Check if the body was parsed
    if (!body || Object.keys(body).length === 0) {
        console.error("V10 FATAL: Request body is missing or empty.");
        return response.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }

    const { action, params, webhook_url, request_id } = body;
    const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

    // Check for required environment variable and body fields
    if (!ZAPIER_MCP_URL) {
        console.error("V10 FATAL: Missing Zapier MCP URL environment variable.");
        return response.status(500).json({ success: false, error: "Server configuration error." });
    }
    if (!action || !webhook_url) {
        console.error(`V10 FATAL: Missing 'action' or 'webhook_url' in request body.`);
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
        
        // Fire-and-forget the webhook call
        axios.post(webhook_url, webhookPayload).catch(err => console.error("V10 WEBHOOK ERROR:", err.message));
        
        // Send the final success response back to Make.com
        return response.status(200).json({ success: true, message: 'Processed successfully.' });

    } catch (error) {
        console.error("V10 ZAPIER ERROR:", error.message);
        const errorDetails = {
            success: false,
            request_id: request_id,
            error: 'Failed during Zapier MCP request.',
            message: error.message,
            details: error.response ? error.response.data : 'No response data'
        };
        
        // Fire-and-forget the error webhook call
        axios.post(webhook_url, errorDetails).catch(err => console.error("V10 WEBHOOK ERROR:", err.message));
        
        // Send the final error response back to Make.com
        return response.status(500).json(errorDetails);
    }
};
