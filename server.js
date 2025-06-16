} catch (error) {
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
