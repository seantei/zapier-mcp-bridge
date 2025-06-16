// server.js - Version 6 (New Zapier URL-based Auth)
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// We only need the URL now, as the key is embedded in it.
const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Main execution endpoint
app.post('/execute', async (req, res) => {
    console.log("V6 EXECUTE: Function invoked.");

    if (!req.body || Object.keys(req.body).length === 0) {
        console.error("V6 FATAL: Request body is missing or empty.");
        return res.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }
    
    if (!ZAPIER_MCP_URL) {
        console.error("V6 FATAL: Missing Zapier MCP URL environment variable.");
        return res.status(500).json({ success: false, error: "Server configuration error." });
    }

    const { action, params, webhook_url, request_id } = req.body;

    if (!action || !webhook_url) {
        console.error(`V6 FATAL: Missing 'action' or 'webhook_url' in request body.`);
        return res.status(400).json({ success: false, error: "Bad Request: Missing required fields in body." });
    }
    console.log(`V6 EXECUTE: All checks passed. Proceeding with action: ${action}`);

    try {
        const zapierPayload = {
            instructions: `Execute the ${action} action.`,
            action: action,
            params: params || {}
        };

        const zapierResponse = await axios.post(ZAPIER_MCP_URL, zapierPayload, {
            // The Authorization header is now REMOVED. Auth is in the URL.
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
        
        axios.post(webhook_url, webhookPayload).catch(err => {
            console.error("V6 WEBHOOK ERROR:", err.message);
        });

        return res.status(200).json({ success: true, message: 'Processed successfully.' });

    } catch (error) {
        console.error("V6 ZAPIER ERROR:", error.message);
        
        const errorDetails = {
            success: false,
            request_id: request_id,
            error: 'Failed during Zapier MCP request.',
            message: error.message,
            details: error.response ? error.response.data : 'No response data'
        };
        
        axios.post(webhook_url, errorDetails).catch(err => {
            console.error("V6 WEBHOOK ERROR:", err.message);
        });

        return res.status(500).json(errorDetails);
    }
});

module.exports = app;
