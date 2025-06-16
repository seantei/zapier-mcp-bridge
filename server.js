// server.js - Version 3 (Robust Waiting Version)
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Environment variables
const ZAPIER_MCP_URL = process.env.ZAPIER_MCP_URL;
const ZAPIER_MCP_TOKEN = process.env.ZAPIER_MCP_TOKEN;

// Health check endpoint - remains the same
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'Zapier MCP Bridge is running'
    });
});

// Main execution endpoint - MODIFIED TO BE SYNCHRONOUS
app.post('/execute', async (req, res) => {
    console.log("V3 EXECUTE: Received request body:", JSON.stringify(req.body, null, 2));
    const { action
