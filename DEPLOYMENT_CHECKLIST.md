# ✅ Socket Server JWT Authentication - Deployment Checklist

## 🚀 Pre-Deployment Checklist

### 1. Environment Configuration

- [x] ✅ `.env` file created in socket-server directory
- [x] ✅ `JWT_SECRET` matches Laravel `APP_KEY`
- [ ] ⚠️ Update `CORS_ORIGINS` for production domains
- [ ] ⚠️ Set `NODE_ENV=production` for production

**Verify:**
```bash
cd socket-server
cat .env
```

**Should show:**
```
JWT_SECRET=base64:h9OOi+g1NaJZu5DvMCRHdqbZtJkb0wQ3syreuoPM6QU=
```

---

### 2. Dependencies Installed

- [x] ✅ `jsonwebtoken` package installed

**Verify:**
```bash
cd socket-server
npm list jsonwebtoken
```

**Should show:**
```
jsonwebtoken@x.x.x
```

---

### 3. Code Updates

- [x] ✅ `server.js` - JWT authentication middleware
- [x] ✅ `config.js` - JWT secret configuration
- [x] ✅ `frontend/services/socket.js` - Authorization header

**Verify:**
```bash
cd socket-server
node -c server.js
echo "Syntax OK"
```

---

### 4. Server Test (Local)

**Start server:**
```bash
cd socket-server
npm start
```

**Expected output:**
```
🚀 Socket.io server running on port 3001
📊 Health check: http://localhost:3001/health
```

**Test health endpoint:**
```bash
curl http://localhost:3001/health
```

**Expected:**
```json
{
  "status": "ok",
  "connections": 0,
  "uptime": 123.45
}
```

---

### 5. Frontend Test

**Open your React app:**
1. Login as a user
2. Open browser DevTools Console
3. Look for socket connection logs

**Expected (Success):**
```
🔌 Connecting to socket with JWT authentication...
✅ Socket connected successfully
```

**If you see errors:**
```
❌ Authentication failed - token may be invalid or expired
```

**Debug steps:**
1. Check if token exists: `localStorage.getItem('token')`
2. Verify JWT_SECRET matches Laravel APP_KEY
3. Restart socket server

---

## 🔒 Security Checklist

### Production Environment

- [ ] ⚠️ Change `SOCKET_URL` in frontend to production URL
- [ ] ⚠️ Use WSS (wss://) instead of WS (ws://)
- [ ] ⚠️ Enable HTTPS/TLS on socket server
- [ ] ⚠️ Update CORS_ORIGINS to production domains only
- [ ] ⚠️ Remove localhost from CORS_ORIGINS
- [ ] ⚠️ Set NODE_ENV=production
- [ ] ⚠️ Enable firewall rules
- [ ] ⚠️ Set up rate limiting (optional)

---

## 📝 Configuration Updates Needed

### For Production Deployment:

#### 1. Socket Server `.env`
```bash
NODE_ENV=production
PORT=3001
JWT_SECRET=base64:h9OOi+g1NaJZu5DvMCRHdqbZtJkb0wQ3syreuoPM6QU=
CORS_ORIGINS=https://brainershub.in,https://www.brainershub.in
LARAVEL_API_URL=https://admin.brainershub.in/api
```

#### 2. Frontend `socket.js` (line 19)
```javascript
// Change from:
const SOCKET_URL = 'https://brainershubsocket.onrender.com';

// To your production URL:
const SOCKET_URL = 'wss://your-socket-server.com';
```

---

## 🧪 Testing Scenarios

### Test 1: Valid JWT Token
```javascript
// Browser console
const token = localStorage.getItem('token');
console.log('Token:', token);
// Should connect successfully
```

### Test 2: Invalid JWT Token
```javascript
// Browser console
localStorage.setItem('token', 'invalid-token');
// Reload page - should fail with auth error
```

### Test 3: Expired Token
```javascript
// Wait for token to expire
// Or use old token
// Should fail with "token expired" error
```

### Test 4: No Token
```javascript
// Browser console
localStorage.removeItem('token');
// Reload page - should fail with "token required" error
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "JWT_SECRET not configured"
**Solution:**
```bash
cd socket-server
echo 'JWT_SECRET=base64:h9OOi+g1NaJZu5DvMCRHdqbZtJkb0wQ3syreuoPM6QU=' >> .env
npm start
```

### Issue 2: "Invalid authentication token"
**Cause:** JWT_SECRET doesn't match Laravel APP_KEY

**Solution:**
1. Get Laravel APP_KEY:
   ```bash
   cd ../brainershub
   grep APP_KEY .env
   ```
2. Copy exact value to socket-server `.env`
3. Restart socket server

### Issue 3: CORS Error
**Solution:**
```javascript
// Update config.js
corsOrigin: [
  'https://brainershub.in',
  'https://www.brainershub.in',
  // Add your frontend domain
]
```

### Issue 4: Connection Timeout
**Check:**
1. Is socket server running?
2. Is firewall blocking port 3001?
3. Is frontend using correct SOCKET_URL?

---

## 📊 Monitoring

### Server Logs to Watch

**Good:**
```
✅ JWT Authenticated: student_123 (user@example.com)
✅ User connected: student_123
```

**Bad:**
```
❌ No authorization header found
❌ JWT Authentication failed
❌ Invalid authentication token
```

### Metrics to Monitor

1. **Connection Count**: `io.engine.clientsCount`
2. **Auth Failures**: Log count of authentication errors
3. **Reconnection Attempts**: Track failed reconnections
4. **Token Expiry**: Monitor token expiration errors

---

## 🔄 Rollback Plan

If JWT authentication causes issues:

### Option 1: Keep JWT but Fix Issues
1. Check JWT_SECRET matches
2. Verify token format
3. Check CORS configuration

### Option 2: Temporary Fallback (NOT RECOMMENDED)
```javascript
// In server.js - add fallback auth (ONLY for debugging)
io.use((socket, next) => {
  // Try JWT first
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader) {
    // JWT auth code...
  } else {
    // Fallback to old method (TEMPORARY)
    const userId = socket.handshake.auth.userId;
    const userType = socket.handshake.auth.userType;
    // ... old code
  }
});
```

---

## ✅ Final Verification

Before going live, verify:

1. [ ] Socket server starts without errors
2. [ ] Health endpoint responds
3. [ ] Frontend connects with valid token
4. [ ] Invalid tokens are rejected
5. [ ] Chat messages work
6. [ ] Notifications work
7. [ ] Online status works
8. [ ] Video calls work (if applicable)
9. [ ] No console errors
10. [ ] Server logs show successful auth

---

## 📞 Emergency Contacts

If issues arise in production:

1. Check server logs: `tail -f socket-server.log`
2. Check frontend console errors
3. Verify JWT_SECRET configuration
4. Check firewall/security groups
5. Verify CORS settings

---

## 🎉 Success Criteria

**You're ready for production when:**

- ✅ Server starts without errors
- ✅ Users connect successfully
- ✅ Invalid tokens rejected
- ✅ All features work (chat, calls, etc.)
- ✅ No security warnings
- ✅ Production configuration complete

---

**Last Updated:** July 30, 2026  
**Status:** Ready for Testing  
**Next Step:** Test in staging environment
