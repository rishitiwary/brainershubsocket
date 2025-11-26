// Socket.io Server Configuration
module.exports = {
  port: process.env.PORT || 3001,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  laravelApiUrl: process.env.LARAVEL_API_URL || 'http://localhost/brainershub/api',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Socket.io options
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for file uploads
  
  // Reconnection settings
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
};

