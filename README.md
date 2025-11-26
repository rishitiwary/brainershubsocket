# Brainers Hub Socket.io Server

Real-time WebSocket server for chat messaging and notifications.

## Installation

```bash
cd socket-server
npm install
```

## Configuration

The server configuration is in `config.js`. You can override these values using environment variables:

- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:3000)
- `LARAVEL_API_URL` - Laravel API URL (default: http://localhost/brainershub/api)
- `NODE_ENV` - Environment (development/production)

## Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Testing the Server

Once running, visit http://localhost:3001/health to see server status.

## Supported Events

### Client -> Server

- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a message to a conversation
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `mark_as_read` - Mark messages as read
- `check_online_status` - Check if users are online
- `send_notification` - Send notification to user

### Server -> Client

- `new_message` - New message received
- `message_sent` - Message delivery confirmation
- `user_typing` - User typing indicator
- `messages_read` - Messages marked as read
- `user_status_change` - User online/offline status
- `user_joined_conversation` - User joined conversation
- `user_left_conversation` - User left conversation
- `online_statuses` - Online status response
- `new_notification` - New notification received

## Production Deployment

### Using PM2

```bash
npm install -g pm2
pm2 start server.js --name socket-server
pm2 save
pm2 startup
```

### Monitor with PM2

```bash
pm2 monit
pm2 logs socket-server
```

## Performance

- Supports 10,000+ concurrent connections per server
- Auto-reconnection on connection loss
- Efficient room-based messaging
- 30-second grace period for offline detection

## Troubleshooting

**Connection refused:**
- Ensure port 3001 is not in use
- Check firewall settings

**CORS errors:**
- Update CORS_ORIGIN in config.js
- Restart the server after changes

**High memory usage:**
- Check for memory leaks
- Restart server periodically
- Consider horizontal scaling

