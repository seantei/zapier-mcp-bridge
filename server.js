// server.js - Version 5 (Modern Parser Fix)
const express = require('express');
const axios = require('axios');
// REMOVED: const bodyParser = require('body-parser');

const app = express();
// UPDATED: Using the modern, built-in Express parser
app.use(express.json());

// Environment variables from your Vercel project settings
const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;
const ZAPIER_MCP_TOKEN = process.env.ZAPIER_MCP_TOKEN;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Main execution endpoint
app.post('/execute', async (req, res) => {
    console.log("V5 EXECUTE: Function invoked.");

    // Defensive check #1: Was the body parsed?
    if (!req.body || Object.keys(req.body).length === 0) {
        const errorMsg = "V5 FATAL: Request body is missing or empty.";
        console.error(errorMsg);
        return res.status(400).json({ success: false, error: "Bad Request: Request body is empty." });
    }
    console.log("V5 EXECUTE: Request body seems to exist.");

    // Defensive check #2: Are the environment variables loaded?
    if (!ZAPIER_MCP_URL || !ZAPIER_MCP_TOKEN) {
        const errorMsg = "V5 FATAL: Missing Zapier environment variables.";
        console.error(errorMsg);
        return res.status(500).json({ success: false, error: "Server configuration error." });
    }
    console.log("V5 EXECUTE: Environment variables seem to be loaded.");

    const { action, params, webhook_url, request_id } = req.body;

    // Defensive check #3: Does the body have the required fields?
    if (!action || !webhook_url) {
        const errorMsg = `V5 FATAL: Missing 'action' or 'webhook_url' in request body.`;
        console.error(errorMsg);
        return res.status(400).json({ success: false, error: "Bad Request: Missing required fields in body." });
    }
    console.log(`V5 EXECUTE: All checks passed. Proceeding with action: ${action}`);

    try {
        const zapierPayload = {
            instructions: `Execute the ${action} action.`,
            action: action,
            params: params || {}
        };

        const zapierResponse = await axios.post(ZAPIER_MCP_URL, zapierPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ZAPIER_MCP_TOKEN}`,
                'Accept': 'application/json, text/event-stream'
            }
        });

        const webhookPayload = {
            success: true,
            request_id: request_id,
            result: zapierResponse.data
        };
        
        axios.post(webhook_url, webhookPayload).catch(err => {
            console.error("V5 WEBHOOK ERROR:", err.message);
        });

        return res.status(200).json({ success: true, message: 'Processed successfully.' });

    } catch (error) {
        console.error("V5 ZAPIER ERROR:", error.message);
        
        const errorDetails = {
            success: false,
            request_id: request_id,
            error: 'Failed during Zapier MCP request.',
            message: error.message,
            details: error.response ? error.response.data : 'No response data'
        };
        
        axios.post(webhook_url, errorDetails).catch(err => {
            console.error("V5 WEBHOOK ERROR:", err.message);
        });

        return res.status(500).json(errorDetails);
    }
});

module.exports = app;
