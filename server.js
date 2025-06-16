// server.js - Version 3 (Complete, Robust Waiting Version)
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Environment variables from your Vercel project settings
const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;
const ZAPIER_MCP_TOKEN = process.env.ZAPIER_MCP_TOKEN;

// Health check endpoint to make sure the service is running
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'Zapier MCP Bridge is running'
    });
});

// Main execution endpoint that Make.com calls
app.post('/execute', async (req, res) => {
    console.log("V3 EXECUTE: Received request body:", JSON.stringify(req.body, null, 2));
    const { action, params, webhook_url, request_id } = req.body;

    // --- Start of error checking ---
    if (!ZAPIER_MCP_URL || !ZAPIER_MCP_TOKEN) {
        console.error("V3 FATAL: Missing Zapier environment variables.");
        return res.status(500).json({ success: false, error: "Server configuration error: Missing environment variables." });
    }

    if (!action || !webhook_url) {
        console.error("V3 ERROR: Missing 'action' or 'webhook_url' in request body.");
        return res.status(400).json({ success: false, error: 'Missing required fields: action and webhook_url' });
    }
    // --- End of error checking ---

    // This is the main logic block. We "try" to do the happy path.
    try {
        console.log(`V3 ZAPIER: Calling Zapier MCP for action: ${action}`);
        const zapierPayload = {
            instructions: `Execute the ${action} action based on the provided parameters.`,
            action: action,
            params: params || {}
        };

        const zapierResponse = await axios.post(ZAPIER_MCP_URL, zapierPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ZAPIER_MCP_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        console.log("V3 ZAPIER: Successfully received response from Zapier.");
        const webhookPayload = {
            success: true,
            request_id: request_id,
            result: zapierResponse.data
        };
        
        console.log("V3 WEBHOOK: Sending success payload to Scenario B webhook.");
        // We use a fire-and-forget for the webhook call itself.
        axios.post(webhook_url, webhookPayload).catch(err => {
            console.error("V3 WEBHOOK: CRITICAL - Failed to send success payload to Scenario B webhook.", err.message);
        });

        // IMPORTANT: Now we send the success response back to Make Scenario A
        return res.status(200).json({ success: true, message: 'Successfully processed and sent to webhook.' });

    } 
    // If anything in the "try" block above fails, the code jumps here.
    catch (error) {
        console.error("V3 ZAPIER: An error occurred while processing the Zapier MCP request.", error.message);
        
        const errorDetails = {
            success: false,
            request_id: request_id,
            error: 'Failed to process Zapier MCP request.',
            message: error.message,
            details: error.response ? error.response.data : 'No response data from Zapier'
        };
        
        console.log("V3 WEBHOOK: Sending ERROR payload to Scenario B webhook.");
        // Attempt to notify Scenario B of the failure
        axios.post(webhook_url, errorDetails).catch(err => {
            console.error("V3 WEBHOOK: CRITICAL - Failed to send ERROR payload to Scenario B webhook.", err.message);
        });

        // IMPORTANT: Now we send an error response back to Make Scenario A
        return res.status(500).json(errorDetails);
    }
});

// This is mainly for local testing; Vercel handles the listening part in production.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

module.exports = app;
