const express = require('express');
const EventSource = require('eventsource');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

// Environment variables - These will be set in Vercel later
const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;
const ZAPIER_MCP_TOKEN = process.env.ZAPIER_MCP_TOKEN;

// Store for tracking requests
const pendingRequests = new Map();

// Health check endpoint - Use this to test if your service is running
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        message: 'Zapier MCP Bridge is running'
    });
});

// Main endpoint that Make.com will call
app.post('/execute', async (req, res) => {
    console.log('Received request from Make.com:', req.body);
    
    const { action, params, webhook_url, request_id } = req.body;

    // Check if we have all required fields
    if (!action || !params || !webhook_url) {
        console.error('Missing required fields');
        return res.status(400).json({
            error: 'Missing required fields. Need: action, params, webhook_url'
        });
    }

    // Generate unique ID for this request
    const reqId = request_id || crypto.randomUUID();
    console.log(`Processing request ${reqId} for action: ${action}`);

    // Store request details
    pendingRequests.set(reqId, {
        action,
        params,
        webhook_url,
        timestamp: Date.now(),
        status: 'pending'
    });

    // Send immediate response to Make.com
    res.status(202).json({
        status: 'accepted',
        request_id: reqId,
        message: 'Your request is being processed'
    });

    // Process the Zapier action in the background
    processZapierAction(reqId, action, params, webhook_url);
});

// Function to interact with Zapier MCP
async function processZapierAction(reqId, action, params, webhookUrl) {
    console.log(`Starting Zapier MCP connection for request ${reqId}`);
    
    let eventSource = null;
    let resultReceived = false;
    let connectionAttempts = 0;
    const maxAttempts = 3;

    async function attemptConnection() {
        connectionAttempts++;
        console.log(`Connection attempt ${connectionAttempts} for request ${reqId}`);

        try {
            // Create connection to Zapier MCP
            eventSource = new EventSource(ZAPIER_MCP_URL, {
                headers: {
                    'Authorization': `Bearer ${ZAPIER_MCP_TOKEN}`,
                    'Accept': 'text/event-stream'
                }
            });

            // Set a timeout for the operation
            const timeout = setTimeout(() => {
                if (!resultReceived) {
                    console.error(`Request ${reqId} timed out after 30 seconds`);
                    if (eventSource) eventSource.close();
                    
                    // Retry if we haven't exceeded max attempts
                    if (connectionAttempts < maxAttempts) {
                        console.log(`Retrying request ${reqId}...`);
                        attemptConnection();
                    } else {
                        sendErrorToMake(webhookUrl, 'Request timed out after multiple attempts', reqId);
                        pendingRequests.delete(reqId);
                    }
                }
            }, 30000);

            // Handle connection opened
            eventSource.onopen = () => {
                console.log(`Connected to Zapier MCP for request ${reqId}`);
            };

            // Handle messages from Zapier
            eventSource.onmessage = async (event) => {
                console.log(`Received message for ${reqId}:`, event.data);
                
                try {
                    const data = JSON.parse(event.data);
                    
                    // Check if this is a result
                    if (data.type === 'result' || data.type === 'tool_result' || data.result) {
                        resultReceived = true;
                        clearTimeout(timeout);
                        
                        console.log(`Got result for request ${reqId}:`, data);
                        
                        // Send result back to Make.com
                        await sendResultToMake(webhookUrl, data, reqId);
                        
                        // Clean up
                        eventSource.close();
                        pendingRequests.delete(reqId);
                    }
                    
                    // Handle errors from Zapier
                    if (data.type === 'error' || data.error) {
                        throw new Error(data.message || data.error || 'Unknown Zapier error');
                    }
                } catch (parseError) {
                    console.error(`Error parsing message for ${reqId}:`, parseError);
                }
            };

            // Handle connection errors
            eventSource.onerror = (error) => {
                console.error(`Connection error for ${reqId}:`, error);
                clearTimeout(timeout);
                
                if (!resultReceived && connectionAttempts < maxAttempts) {
                    if (eventSource) eventSource.close();
                    setTimeout(() => attemptConnection(), 2000 * connectionAttempts);
                } else if (!resultReceived) {
                    sendErrorToMake(webhookUrl, 'Failed to connect to Zapier after multiple attempts', reqId);
                    pendingRequests.delete(reqId);
                }
            };

        } catch (error) {
            console.error(`Error in connection attempt ${connectionAttempts}:`, error);
            if (connectionAttempts < maxAttempts) {
                setTimeout(() => attemptConnection(), 2000 * connectionAttempts);
            } else {
                sendErrorToMake(webhookUrl, error.message, reqId);
                pendingRequests.delete(reqId);
            }
        }
    }

    // Start the first connection attempt
    attemptConnection();
}

// Send successful result back to Make.com
async function sendResultToMake(webhookUrl, data, requestId) {
    try {
        const payload = {
            success: true,
            request_id: requestId,
            timestamp: new Date().toISOString(),
            result: data,
            message: 'Action completed successfully'
        };

        console.log(`Sending result to Make.com webhook for ${requestId}`);
        await axios.post(webhookUrl, payload);
        console.log(`Result sent successfully for ${requestId}`);
    } catch (error) {
        console.error(`Failed to send result to Make.com:`, error.message);
    }
}

// Send error back to Make.com
async function sendErrorToMake(webhookUrl, errorMessage, requestId) {
    try {
        const payload = {
            success: false,
            request_id: requestId,
            timestamp: new Date().toISOString(),
            error: errorMessage,
            message: 'Action failed'
        };

        console.log(`Sending error to Make.com webhook for ${requestId}`);
        await axios.post(webhookUrl, payload);
        console.log(`Error sent successfully for ${requestId}`);
    } catch (error) {
        console.error(`Failed to send error to Make.com:`, error.message);
    }
}

// Status check endpoint (optional - useful for debugging)
app.get('/status/:request_id', (req, res) => {
    const request = pendingRequests.get(req.params.request_id);
    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }
    res.json(request);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Zapier MCP Bridge Service running on port ${PORT}`);
    console.log('Environment check:');
    console.log('- ZAPIER_MCP_URL:', ZAPIER_MCP_URL ? '✅ Set' : '❌ MISSING!');
    console.log('- ZAPIER_MCP_TOKEN:', ZAPIER_MCP_TOKEN ? '✅ Set' : '❌ MISSING!');
    
    if (!ZAPIER_MCP_URL || !ZAPIER_MCP_TOKEN) {
        console.error('⚠️  WARNING: Missing environment variables!');
        console.error('Please set ZAPIER_MCP_URL and ZAPIER_MCP_TOKEN in your environment.');
    }
});
