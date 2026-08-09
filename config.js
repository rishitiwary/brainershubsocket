// Load environment variables
require('dotenv').config();

// Socket.io Server Configuration
module.exports = {
  port: process.env.PORT || 3001,
  corsOrigin: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',')
    : ['https://brainershub.in', 'https://www.brainershub.in', 'http://localhost:3000','http://localhost:3002'],
  laravelApiUrl: process.env.LARAVEL_API_URL || 'https://admin.brainershub.in/api',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration for Sanctum token validation
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME ,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  
  // Socket.io options
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for file uploads
  
  // Reconnection settings
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
};

