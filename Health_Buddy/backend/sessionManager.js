// In-memory session storage
// In production, you should use Redis or a database
const sessions = new Map();

// Session timeout: 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000;

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastAccessed > SESSION_TIMEOUT) {
      sessions.delete(sessionId);
      console.log(`Session ${sessionId} expired and removed`);
    }
  }
}, 5 * 60 * 1000);

function storeAnalysis(sessionId, analysis, webInfo = null, formattedData = null) {
  const session = {
    analysis,
    webInfo,
    formattedData,
    conversationHistory: [],
    createdAt: Date.now(),
    lastAccessed: Date.now()
  };
  
  sessions.set(sessionId, session);
  console.log(`Session ${sessionId} created/updated`);
  
  return session;
}

function getAnalysis(sessionId) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Update last accessed time
  session.lastAccessed = Date.now();
  sessions.set(sessionId, session);
  
  return session;
}

function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Merge updates
  Object.assign(session, updates);
  session.lastAccessed = Date.now();
  sessions.set(sessionId, session);
  
  return session;
}

function addToConversationHistory(sessionId, role, content) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  session.conversationHistory.push({
    role,
    content,
    timestamp: Date.now()
  });
  
  // Keep only last 10 messages to prevent memory issues
  if (session.conversationHistory.length > 10) {
    session.conversationHistory = session.conversationHistory.slice(-10);
  }
  
  session.lastAccessed = Date.now();
  sessions.set(sessionId, session);
  
  return session;
}

function hasSession(sessionId) {
  return sessions.has(sessionId);
}

function deleteSession(sessionId) {
  const deleted = sessions.delete(sessionId);
  if (deleted) {
    console.log(`Session ${sessionId} deleted`);
  }
  return deleted;
}

function getSessionStats() {
  return {
    totalSessions: sessions.size,
    sessions: Array.from(sessions.entries()).map(([id, session]) => ({
      id,
      createdAt: new Date(session.createdAt).toISOString(),
      lastAccessed: new Date(session.lastAccessed).toISOString(),
      messageCount: session.conversationHistory.length
    }))
  };
}

module.exports = {
  storeAnalysis,
  getAnalysis,
  updateSession,
  addToConversationHistory,
  hasSession,
  deleteSession,
  getSessionStats
};