const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const config = require('./config');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Create database connection pool for Sanctum token validation
const dbPool = mysql.createPool(config.database);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connections: io.engine.clientsCount,
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Brainers Hub Socket.io Server',
    version: '1.0.0',
    connections: io.engine.clientsCount
  });
});

// Database health check endpoint
app.get('/db-health', async (req, res) => {
  try {
    // Test database connection
    const [rows] = await dbPool.execute('SELECT 1 as test');
    
    // Get database info
    const [dbInfo] = await dbPool.execute('SELECT DATABASE() as db_name, USER() as db_user');
    
    res.json({
      status: 'ok',
      message: 'Database connection successful',
      database: {
        name: dbInfo[0].db_name,
        user: dbInfo[0].db_user,
        host: config.database.host,
        port: config.database.port
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlMessage: error.sqlMessage
      },
      config: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        passwordSet: !!config.database.password
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Socket.io setup
const io = socketIO(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  transports: ['polling', 'websocket'], // Start with polling, then upgrade
  allowUpgrades: true,
  pingTimeout: config.pingTimeout,
  pingInterval: config.pingInterval,
  maxHttpBufferSize: config.maxHttpBufferSize,
  allowEIO3: true // Support older clients
});

// Store for online users
const onlineUsers = new Map(); // userKey -> Set of socket IDs

// Sanctum Authentication middleware
io.use(async (socket, next) => {
  try {
    // Get token from auth object (works with WebSocket!)
    const bearerToken = socket.handshake.auth.token;
    
    if (!bearerToken) {
      console.log('❌ No authentication token found');
      return next(new Error('Authentication token required'));
    }
    
    // Parse Sanctum token format: userId|plainToken
    const tokenParts = bearerToken.split('|');
    
    if (tokenParts.length !== 2) {
      console.log('❌ Invalid token format');
      return next(new Error('Invalid token format'));
    }
    
    const userId = parseInt(tokenParts[0]);
    const plainToken = tokenParts[1];
    
    // Hash the plain token to match database
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    
    // Query database to validate token
    const [rows] = await dbPool.execute(
      `SELECT pat.*, s.id, s.firstname, s.lastname, s.email, s.role 
       FROM personal_access_tokens pat
       LEFT JOIN students s ON pat.tokenable_id = s.id AND pat.tokenable_type = 'App\\\\Models\\\\Student'
       WHERE pat.tokenable_id = ? AND pat.token = ?
       LIMIT 1`,
      [userId, hashedToken]
    );
    
    if (rows.length === 0) {
      console.log('❌ Invalid token - not found in database');
      return next(new Error('Invalid authentication token'));
    }
    
    const tokenRecord = rows[0];
    
    // Check if token is expired
    if (tokenRecord.expires_at) {
      const expiresAt = new Date(tokenRecord.expires_at);
      if (new Date() > expiresAt) {
        console.log('❌ Token expired');
        return next(new Error('Authentication token expired'));
      }
    }
    
    // Extract user info
    socket.userId = tokenRecord.id;
    socket.email = tokenRecord.email;
    socket.name = `${tokenRecord.firstname || ''} ${tokenRecord.lastname || ''}`.trim();
    
    // Determine user type from role (role: 3 = teacher, otherwise student)
    socket.userType = (tokenRecord.role === 3 || tokenRecord.role === '3') ? 'teacher' : 'student';
    socket.userKey = `${socket.userType}_${socket.userId}`;
    
    console.log(`✅ Sanctum Authenticated: ${socket.userKey} (${socket.name || socket.email})`);
    
    // Update last_used_at for the token
    await dbPool.execute(
      'UPDATE personal_access_tokens SET last_used_at = NOW() WHERE id = ?',
      [tokenRecord.id]
    );
    
    next();
    
  } catch (error) {
    console.error('❌ Sanctum Authentication failed:', error.message);
    return next(new Error('Authentication failed'));
  }
});

// Connection handler
io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.userKey} (${socket.id})`);
  
  // Add user to online users
  if (!onlineUsers.has(socket.userKey)) {
    onlineUsers.set(socket.userKey, new Set());
  }
  onlineUsers.get(socket.userKey).add(socket.id);
  
  // Subscribe to personal notifications/messages
  const userRoom = `user_${socket.userKey}`;
  socket.join(userRoom);
  console.log(`  📍 Joined room: ${userRoom}`);
  
  // Broadcast user online status
  socket.broadcast.emit('user_status_change', {
    userId: socket.userId,
    userType: socket.userType,
    status: 'online',
    timestamp: Date.now()
  });
  
  // ==================== CHAT HANDLERS ====================
  
  /**
   * Join conversation room
   */
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`${socket.userKey} joined conversation ${conversationId}`);
    
    // Notify others in conversation that user is online
    socket.to(`conversation_${conversationId}`).emit('user_joined_conversation', {
      userId: socket.userId,
      userType: socket.userType,
      conversationId,
      timestamp: Date.now()
    });
  });
  
  /**
   * Leave conversation room
   */
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`${socket.userKey} left conversation ${conversationId}`);
    
    // Notify others
    socket.to(`conversation_${conversationId}`).emit('user_left_conversation', {
      userId: socket.userId,
      userType: socket.userType,
      conversationId,
      timestamp: Date.now()
    });
  });
  
  /**
   * Send message (broadcast to conversation room AND recipient's personal room)
   */
  socket.on('send_message', (data) => {
    const { conversationId, message, tempId } = data;
    
    console.log(`📤 Message from ${socket.userKey} in conversation ${conversationId}`);
    
    const messageData = {
      ...message,
      tempId, // For optimistic UI updates
      timestamp: Date.now()
    };
    
    // 1. Broadcast to conversation room (for users actively in chat)
    io.to(`conversation_${conversationId}`).emit('new_message', messageData);
    console.log(`  ✅ Sent to conversation_${conversationId} room`);
    
    // 2. ALSO send to recipient's personal user room (for notifications)
    // This ensures the recipient gets the message even if not in conversation room
    if (message.conversation_id) {
      // We need to know who the recipient is - send to all potential participants
      // The App.jsx will filter out own messages
      io.emit('new_message', messageData);
      console.log(`  ✅ Broadcasted to all connected users for notifications`);
    }
    
    // Send delivery confirmation to sender
    socket.emit('message_sent', {
      tempId,
      messageId: message.id,
      conversationId,
      timestamp: Date.now()
    });
  });
  
  /**
   * Typing indicator - start typing
   */
  socket.on('typing_start', (data) => {
    const { conversationId } = data;
    
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      userType: socket.userType,
      conversationId,
      isTyping: true,
      timestamp: Date.now()
    });
  });
  
  /**
   * Typing indicator - stop typing
   */
  socket.on('typing_stop', (data) => {
    const { conversationId } = data;
    
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      userType: socket.userType,
      conversationId,
      isTyping: false,
      timestamp: Date.now()
    });
  });
  
  /**
   * Mark messages as read
   */
  socket.on('mark_as_read', (data) => {
    const { conversationId, messageIds } = data;
    
    socket.to(`conversation_${conversationId}`).emit('messages_read', {
      userId: socket.userId,
      userType: socket.userType,
      conversationId,
      messageIds,
      readAt: Date.now()
    });
  });
  
  /**
   * Get online status
   */
  socket.on('check_online_status', (data) => {
    const { userIds } = data; // Array of { userId, userType }
    const statuses = {};
    
    userIds.forEach(({ userId, userType }) => {
      const userKey = `${userType}_${userId}`;
      statuses[userKey] = onlineUsers.has(userKey) && onlineUsers.get(userKey).size > 0;
    });
    
    socket.emit('online_statuses', statuses);
  });
  
  // ==================== NOTIFICATIONS ====================
  
  /**
   * Send notification to specific user
   */
  socket.on('send_notification', (data) => {
    const { targetUserId, targetUserType, notification } = data;
    const targetUserKey = `${targetUserType}_${targetUserId}`;
    
    io.to(`user_${targetUserKey}`).emit('new_notification', {
      ...notification,
      timestamp: Date.now()
    });
  });
  
  // ==================== VOICE/VIDEO CALLS ====================
  
  /**
   * Initiate call
   */
  socket.on('initiate_call', (data) => {
    const { call, to_user_id, to_user_type } = data;
    const targetUserKey = `${to_user_type}_${to_user_id}`;
    const targetRoom = `user_${targetUserKey}`;
    
    // Pass through ALL enriched call data from ChatWindow
    const callData = {
      ...call,
      timestamp: Date.now()
    };
    
    // Send incoming call to target user room
    io.to(targetRoom).emit('incoming_call', callData);
  });
  
  /**
   * Accept call
   */
  socket.on('accept_call', (data) => {
    const { call_id, user_id, user_type } = data;
    
    // Notify all participants that call was accepted
    io.emit('call_accepted', {
      callId: call_id,
      id: call_id,
      acceptedBy: {
        id: user_id,
        type: user_type
      },
      timestamp: Date.now()
    });
  });
  
  /**
   * Reject call
   */
  socket.on('reject_call', (data) => {
    const { call_id, user_id, user_type } = data;
    
    // Notify all participants that call was rejected
    io.emit('call_rejected', {
      callId: call_id,
      id: call_id,
      rejectedBy: {
        id: user_id,
        type: user_type
      },
      timestamp: Date.now()
    });
  });
  
  /**
   * End call
   */
  socket.on('end_call', (data) => {
    const { call_id, user_id, user_type } = data;
    
    // Notify all participants that call ended
    io.emit('call_ended', {
      callId: call_id,
      id: call_id,
      endedBy: {
        id: user_id,
        type: user_type
      },
      timestamp: Date.now()
    });
  });
  
  /**
   * WebRTC signaling - relay ICE candidates and SDP offers/answers
   */
  socket.on('call_signal', (data) => {
    const { callId, call_id, signal, to_user_id, to_user_type } = data;
    const actualCallId = callId || call_id;
    const targetUserKey = `${to_user_type}_${to_user_id}`;
    
    const signalData = {
      callId: actualCallId,
      id: actualCallId,
      call_id: actualCallId,
      signal,
      from: {
        id: socket.userId,
        type: socket.userType
      },
      timestamp: Date.now()
    };
    
    // Send to target user's room
    const roomName = `user_${targetUserKey}`;
    io.to(roomName).emit('call_signal', signalData);
  });
  
  // ==================== DISCONNECT ====================
  
  socket.on('disconnect', () => {
  
    
    // Remove socket from user's socket list
    if (onlineUsers.has(socket.userKey)) {
      onlineUsers.get(socket.userKey).delete(socket.id);
      
      // If user has no more active sockets, they're offline
      if (onlineUsers.get(socket.userKey).size === 0) {
        onlineUsers.delete(socket.userKey);
        
        // Broadcast user offline status after 30 second delay
        setTimeout(() => {
          // Check again if user is still offline
          if (!onlineUsers.has(socket.userKey)) {
            io.emit('user_status_change', {
              userId: socket.userId,
              userType: socket.userType,
              status: 'offline',
              lastSeen: Date.now()
            });
          }
        }, 30000);
      }
    }
  });
  
  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.userKey}:`, error);
  });
});

// Start server
const PORT = config.port;
server.listen(PORT, () => {

  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
 
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️  SIGINT received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Log stats every 5 minutes
setInterval(() => {
  console.log(`📊 Active connections: ${io.engine.clientsCount}, Online users: ${onlineUsers.size}`);
}, 300000);

