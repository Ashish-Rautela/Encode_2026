const NodeCache = require('node-cache');

// Session cache with 15-minute TTL and check for expired sessions every 5 minutes
const sessionCache = new NodeCache({ 
    stdTTL: 15 * 60, // 15 minutes
    checkperiod: 5 * 60, // 5 minutes
    useClones: false
});

// Store product analysis in session
function storeAnalysis(sessionId, analysis) {
    return sessionCache.set(sessionId, {
        analysis,
        timestamp: Date.now()
    });
}

// Get product analysis from session
function getAnalysis(sessionId) {
    return sessionCache.get(sessionId);
}

// Check if session exists
function hasSession(sessionId) {
    return sessionCache.has(sessionId);
}

module.exports = {
    storeAnalysis,
    getAnalysis,
    hasSession
};
