const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const config = require('./config');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

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

// Socket.io setup
const io = socketIO(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: config.pingTimeout,
  pingInterval: config.pingInterval,
  maxHttpBufferSize: config.maxHttpBufferSize
});

// Store for online users
const onlineUsers = new Map(); // userKey -> Set of socket IDs

// Authentication middleware
io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  const userType = socket.handshake.auth.userType;
  
  if (!userId || !userType) {
    return next(new Error('Authentication required'));
  }
  
  // Store user info on socket
  socket.userId = userId;
  socket.userType = userType;
  socket.userKey = `${userType}_${userId}`;
  
  next();
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
    const { call, to_user_id, to_user_type, initiator_name } = data;
    const targetUserKey = `${to_user_type}_${to_user_id}`;
    const targetRoom = `user_${targetUserKey}`;
    
    console.log(`📞 Call initiated from ${socket.userKey} to ${targetUserKey}`, {
      callId: call.id,
      callType: call.call_type
    });
    
    // Check if target user is in the room
    const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
    console.log(`  📍 Target room: ${targetRoom}, Sockets in room: ${roomSockets ? roomSockets.size : 0}`);
    
    if (roomSockets && roomSockets.size > 0) {
      console.log(`  👥 Sockets in ${targetRoom}:`, Array.from(roomSockets));
    } else {
      console.log(`  ⚠️  WARNING: No sockets in room ${targetRoom}! User may not be connected.`);
    }
    
    // Send incoming call to target user room
    io.to(targetRoom).emit('incoming_call', {
      ...call,
      initiator_id: socket.userId,
      initiator_type: socket.userType,
      initiator_name: initiator_name || 'Unknown',
      timestamp: Date.now()
    });
    
    console.log(`  ✅ Sent incoming_call to ${targetRoom}`);
    
    // ALSO broadcast to all sockets of that user (backup)
    if (onlineUsers.has(targetUserKey)) {
      const userSockets = onlineUsers.get(targetUserKey);
      userSockets.forEach(socketId => {
        io.to(socketId).emit('incoming_call', {
          ...call,
          initiator_id: socket.userId,
          initiator_type: socket.userType,
          initiator_name: initiator_name || 'Unknown',
          timestamp: Date.now()
        });
        console.log(`  📤 Sent to socket: ${socketId}`);
      });
    }
  });
  
  /**
   * Accept call
   */
  socket.on('accept_call', (data) => {
    const { call_id, user_id, user_type } = data;
    
    console.log(`✅ Call ${call_id} accepted by ${user_type}_${user_id}`);
    
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
    
    console.log(`❌ Call ${call_id} rejected by ${user_type}_${user_id}`);
    
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
    
    console.log(`📴 Call ${call_id} ended by ${user_type}_${user_id}`);
    
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
    
    console.log(`🔄 WebRTC signal for call ${actualCallId} to ${targetUserKey}`);
    
    // Forward signal to target user room
    io.to(`user_${targetUserKey}`).emit('call_signal', {
      callId: actualCallId,
      id: actualCallId,
      call_id: actualCallId,
      signal,
      from: {
        id: socket.userId,
        type: socket.userType
      },
      timestamp: Date.now()
    });
    
    // Also send directly to user's sockets (backup)
    if (onlineUsers.has(targetUserKey)) {
      const userSockets = onlineUsers.get(targetUserKey);
      userSockets.forEach(socketId => {
        io.to(socketId).emit('call_signal', {
          callId: actualCallId,
          id: actualCallId,
          call_id: actualCallId,
          signal,
          from: {
            id: socket.userId,
            type: socket.userType
          },
          timestamp: Date.now()
        });
      });
      console.log(`  📤 Sent WebRTC signal to ${userSockets.size} socket(s)`);
    }
  });
  
  // ==================== DISCONNECT ====================
  
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.userKey} (${socket.id})`);
    
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
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Brainers Hub Socket.io Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Environment: ${config.nodeEnv}`);
  console.log(`✅ CORS Origin: ${config.corsOrigin}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, closing server...');
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

