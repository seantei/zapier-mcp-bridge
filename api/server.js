// api/server.js
const axios = require('axios');

async function getBody(req) {
    return new Promise((resolve) => {
        // If body is already parsed, return it
        if (req.body !== undefined) {
            resolve(req.body);
            return;
        }
        
        // Otherwise, manually parse it
        let data = '';
        req.on('data', chunk => {
            data += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                console.error("Failed to parse body:", e.message);
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

module.exports = async (req, res) => {
    console.log("EXECUTE: Method:", req.method);
    console.
