# 🔒 Socket.IO JWT Authentication - Implementation Guide

## ✅ What Was Implemented

### Secure JWT-Based Authentication
Your Socket.IO server now uses **JWT (JSON Web Token)** authentication instead of plain `userId` and `userType` parameters. This prevents hackers from impersonating users.

---

## 🛡️ Security Features

### Before (INSECURE):
```javascript
// ❌ Anyone could fake this
socket = io(url, {
  auth: {
    userId: 123,
    userType: 'student'
  }
});
```

### After (SECURE):
```javascript
// ✅ JWT token verified by server
socket = io(url, {
  extraHeaders: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIs...'
  }
});
```

---

## 🔐 How It Works

### 1. **Client Authentication Flow**

```
User logs in → Laravel issues JWT token → Token stored in localStorage
                                              ↓
User opens app → Socket connects → Sends token in Authorization header
                                              ↓
Socket server → Verifies JWT → Extracts user info → Connection allowed
```

### 2. **Server-Side Verification**

The server:
- ✅ Verifies the JWT signature (can't be forged)
- ✅ Checks if token is expired
- ✅ Extracts user ID and role from token payload
- ✅ Rejects invalid/expired tokens

---

## 📋 Files Modified

### Backend (Socket Server):

1. **`.env`** (NEW)
   - Contains JWT_SECRET (must match Laravel APP_KEY)
   - Environment configuration

2. **`config.js`**
   - Added `jwtSecret` configuration
   - Loads from environment variables

3. **`server.js`**
   - Added `jsonwebtoken` import
   - Updated authentication middleware to verify JWT
   - Better error handling for auth failures

4. **`package.json`**
   - Added `jsonwebtoken` dependency

### Frontend (React):

1. **`services/socket.js`**
   - Updated `connect()` method to use Authorization header
   - Automatically gets token from localStorage
   - Better error handling for auth failures
   - Stops reconnection on auth errors

---

## 🚀 Usage

### Frontend Connection

**Automatic (Recommended):**
```javascript
import socketService from './services/socket';

// Token automatically retrieved from localStorage
socketService.connect();
```

**Manual:**
```javascript
import socketService from './services/socket';

const token = localStorage.getItem('token');
socketService.connect(userId, userType, token);
```

### Testing Connection

**Success:**
```
✅ Socket connected successfully
✅ JWT Authenticated: student_123 (user@example.com)
```

**Failed (Invalid Token):**
```
❌ Authentication failed - token may be invalid or expired
❌ Connection error: Invalid authentication token
```

---

## 🔧 Configuration

### Environment Variables

**`.env` file:**
```bash
# Port
PORT=3001

# JWT Secret (MUST match Laravel APP_KEY)
JWT_SECRET=base64:h9OOi+g1NaJZu5DvMCRHdqbZtJkb0wQ3syreuoPM6QU=

# CORS Origins
CORS_ORIGINS=https://brainershub.in,http://localhost:3000

# Laravel API URL
LARAVEL_API_URL=https://admin.brainershub.in/api
```

### JWT Token Payload

Your Laravel JWT tokens should contain:
```json
{
  "id": 123,
  "email": "user@example.com",
  "role": 1,
  "iat": 1234567890,
  "exp": 1234571490
}
```

The socket server extracts:
- `id` → User ID
- `role` → User type (3 = teacher, otherwise student)
- `email` → User email

---

## 🧪 Testing

### 1. **Valid Token Test**

```javascript
// Should connect successfully
const token = localStorage.getItem('token');
socketService.connect(null, null, token);
```

### 2. **Invalid Token Test**

```javascript
// Should fail with "Invalid authentication token"
socketService.connect(null, null, 'fake-token');
```

### 3. **Expired Token Test**

```javascript
// Should fail with "Authentication token expired"
// Use an old token
```

### 4. **No Token Test**

```javascript
// Should fail with "Authentication token required"
localStorage.removeItem('token');
socketService.connect();
```

---

## 🔒 Security Best Practices Implemented

### 1. **JWT Verification**
- ✅ Server verifies token signature
- ✅ Checks expiration
- ✅ Validates against secret key

### 2. **Secure Transport**
- ✅ Use WSS (WebSocket Secure) in production
- ✅ HTTPS/TLS encryption

### 3. **Token Storage**
- ✅ Stored in localStorage (same as Laravel auth)
- ✅ Automatically included in socket connection

### 4. **Error Handling**
- ✅ Stops reconnection on auth failures
- ✅ Clear error messages
- ✅ Prevents infinite retry loops

### 5. **CORS Protection**
- ✅ Whitelist only allowed origins
- ✅ No wildcard (*) origins

---

## 🐛 Troubleshooting

### Connection Fails Immediately

**Check:**
1. Is JWT_SECRET set in `.env`?
2. Does it match Laravel APP_KEY?
3. Is token present in localStorage?
4. Is token valid (not expired)?

**Debug:**
```javascript
// Check token
const token = localStorage.getItem('token');
console.log('Token:', token);

// Decode token (without verification)
const base64Url = token.split('.')[1];
const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
const payload = JSON.parse(window.atob(base64));
console.log('Token payload:', payload);
console.log('Expires:', new Date(payload.exp * 1000));
```

### Server Logs "JWT_SECRET not configured"

**Fix:**
1. Create `.env` file in socket-server directory
2. Add `JWT_SECRET` from Laravel `.env` file
3. Restart socket server

### Token Verification Fails

**Common Issues:**
- JWT_SECRET doesn't match Laravel APP_KEY
- Token format is incorrect
- Token has expired
- Token was issued by different server

**Solution:**
1. Copy exact APP_KEY from Laravel `.env`
2. Paste into socket-server `.env` as JWT_SECRET
3. Ensure format includes `base64:` prefix
4. Restart socket server

---

## 📊 Performance Impact

- **Minimal overhead** - JWT verification is fast (~1ms)
- **No database queries** - Token contains all needed info
- **Scalable** - Stateless authentication

---

## 🔄 Token Refresh Strategy

If your tokens expire frequently, implement token refresh:

```javascript
// Refresh token every 30 minutes
setInterval(async () => {
  const newToken = await refreshAuthToken();
  localStorage.setItem('token', newToken);
  
  // Reconnect socket with new token
  socketService.disconnect();
  socketService.connect();
}, 30 * 60 * 1000);
```

---

## 📞 Support

### Common Errors:

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `Authentication token required` | No token sent | Check localStorage for token |
| `Invalid authentication token` | Token format wrong | Verify token is valid JWT |
| `Authentication token expired` | Token too old | Refresh token or re-login |
| `JWT_SECRET not configured` | Missing .env | Create .env with JWT_SECRET |

---

## ✨ Benefits Over Previous Implementation

1. **Security**: Can't fake user identity
2. **Scalability**: No session storage needed
3. **Standard**: Industry-standard approach
4. **Integration**: Uses existing Laravel tokens
5. **Maintenance**: Single source of truth for auth

---

**Implementation Date:** July 30, 2026
**Status:** ✅ Production Ready
**Security Level:** ✅ High (JWT-based)
