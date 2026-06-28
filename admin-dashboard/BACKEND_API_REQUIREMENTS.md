# Backend API Requirements for Admin Dashboard V2.0

This document outlines the additional backend endpoints required for the Admin Dashboard V2.0 features to work fully.

---

## 📚 **1. Knowledge Base Management**

### Upload PDF Document
```
POST /api/admin/knowledge-base/upload
Content-Type: multipart/form-data

Request Body:
{
  file: <PDF file>
}

Response (201):
{
  "success": true,
  "document": {
    "id": "uuid",
    "filename": "document.pdf",
    "file_size": 1024000,
    "status": "processing",
    "uploaded_at": "2026-04-16T10:00:00Z",
    "uploaded_by": "agent_id"
  }
}
```

### List Documents
```
GET /api/admin/knowledge-base

Response (200):
{
  "success": true,
  "documents": [
    {
      "id": "uuid",
      "filename": "document.pdf",
      "file_size": 1024000,
      "status": "processed",
      "chunks_count": 45,
      "uploaded_at": "2026-04-16T10:00:00Z",
      "uploaded_by": "agent_id"
    }
  ]
}
```

### Delete Document
```
DELETE /api/admin/knowledge-base/:documentId

Response (200):
{
  "success": true,
  "message": "Document deleted successfully"
}
```

---

## 🔔 **2. Notification System**

### Get Notifications
```
GET /api/admin/notifications?limit=10

Response (200):
{
  "success": true,
  "notifications": [
    {
      "id": "uuid",
      "type": "assignment|escalation|message|system",
      "message": "New chat assigned to you from John Doe",
      "chatId": "chat_uuid",
      "isRead": false,
      "createdAt": "2026-04-16T10:00:00Z"
    }
  ],
  "unreadCount": 5
}
```

### Mark Notification as Read
```
PATCH /api/admin/notifications/:notificationId/read

Response (200):
{
  "success": true,
  "notification": {
    "id": "uuid",
    "isRead": true
  }
}
```

### Mark All as Read
```
POST /api/admin/notifications/mark-all-read

Response (200):
{
  "success": true,
  "count": 5
}
```

### Delete Notification
```
DELETE /api/admin/notifications/:notificationId

Response (200):
{
  "success": true
}
```

---

## 👥 **3. Chat Assignment**

### Assign Chat to Agent
```
PATCH /api/admin/chats/:chatId/assign

Request Body:
{
  "agentId": "agent_uuid"
}

Response (200):
{
  "success": true,
  "chat": {
    "id": "chat_uuid",
    "assigned_to": "agent_uuid",
    "agent_name": "John Doe",
    "assigned_at": "2026-04-16T10:00:00Z"
  }
}

Side Effect:
- Create notification for assigned agent
- Emit Socket.IO event: 'chat-assigned'
```

### Get My Assigned Chats
```
GET /api/admin/chats/my-chats

Response (200):
{
  "success": true,
  "chats": [
    {
      "id": "uuid",
      "user_name": "Customer Name",
      "user_email": "customer@example.com",
      "status": "active|pending|closed",
      "assigned_to": "current_agent_id",
      "agent_name": "Me",
      "updated_at": "2026-04-16T10:00:00Z"
    }
  ]
}
```

---

## 💬 **4. Enhanced Chat Messages**

### Update Get Chat Details Endpoint
```
GET /api/admin/chats/:chatId

Response should include agent_name in messages:
{
  "success": true,
  "chat": {
    "id": "uuid",
    "user_name": "Customer",
    "user_email": "customer@example.com",
    "status": "active",
    "assigned_to": "agent_uuid",
    "agent_name": "John Doe"
  },
  "messages": [
    {
      "id": "uuid",
      "content": "Hello",
      "sender_type": "user|ai|agent",
      "agent_name": "John Doe",  // NEW: Include agent name
      "created_at": "2026-04-16T10:00:00Z"
    }
  ]
}
```

### Update Reply Endpoint
```
POST /api/admin/chats/:chatId/reply

Request Body:
{
  "content": "Message content"
}

Response should include agent name:
{
  "success": true,
  "message": {
    "id": "uuid",
    "content": "Message content",
    "sender_type": "agent",
    "agent_id": "current_user_id",
    "agent_name": "John Doe",  // NEW
    "created_at": "2026-04-16T10:00:00Z"
  }
}

Side Effect:
- Emit Socket.IO event: 'new-message' to chat room
```

---

## 🔌 **5. Socket.IO Events**

### Server-Side Events to Emit:

#### New Message
```javascript
io.to(`chat_${chatId}`).emit('new-message', {
  id: 'message_uuid',
  chatId: 'chat_uuid',
  content: 'Message content',
  sender_type: 'agent',
  agent_name: 'John Doe',
  created_at: '2026-04-16T10:00:00Z'
})
```

#### Chat Assigned
```javascript
io.to(`user_${agentId}`).emit('chat-assigned', {
  chatId: 'chat_uuid',
  userName: 'Customer Name',
  userEmail: 'customer@example.com',
  assignedBy: 'admin_name'
})
```

#### Chat Escalated
```javascript
io.to('agents').emit('chat-escalated', {
  chatId: 'chat_uuid',
  userName: 'Customer Name',
  reason: 'AI could not resolve'
})
```

#### General Notification
```javascript
io.to(`user_${userId}`).emit('notification', {
  id: 'notification_uuid',
  type: 'assignment',
  message: 'New chat assigned to you',
  chatId: 'chat_uuid',
  isRead: false,
  createdAt: '2026-04-16T10:00:00Z'
})
```

### Client-Side Events to Listen:

#### Join Chat Room
```javascript
socket.on('join-chat', ({ chatId }) => {
  socket.join(`chat_${chatId}`)
})
```

---

## 🔐 **6. Authentication**

### Get Current User
```
GET /api/auth/me

Response (200):
{
  "success": true,
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin|agent",
    "is_available": true,
    "status": "online|offline"
  }
}
```

---

## 📊 **7. Database Schema Updates**

### notifications table (NEW)
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  chat_id UUID REFERENCES chats(id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
```

### knowledge_base table (NEW)
```sql
CREATE TABLE knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'processing',
  chunks_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kb_status ON knowledge_base_documents(status);
```

### messages table (UPDATE)
```sql
ALTER TABLE messages
ADD COLUMN agent_id UUID REFERENCES users(id),
ADD COLUMN agent_name VARCHAR(255);

CREATE INDEX idx_messages_agent_id ON messages(agent_id);
```

### chats table (UPDATE)
```sql
ALTER TABLE chats
ADD COLUMN assigned_to UUID REFERENCES users(id),
ADD COLUMN assigned_at TIMESTAMP;

CREATE INDEX idx_chats_assigned_to ON chats(assigned_to);
```

---

## 🎯 **Implementation Priority**

### Phase 1: Critical (Required for basic V2.0 functionality)
1. ✅ Chat assignment endpoint (PATCH /admin/chats/:id/assign)
2. ✅ Get my chats endpoint (GET /admin/chats/my-chats)
3. ✅ Socket.IO events for real-time messaging
4. ✅ Agent name in messages

### Phase 2: Important (Enhances user experience)
5. ✅ Notification endpoints (GET, PATCH, DELETE)
6. ✅ Socket.IO notification events
7. ✅ Current user endpoint (GET /auth/me)

### Phase 3: Nice-to-have (Can be added later)
8. ⚠️ Knowledge base upload (POST /admin/knowledge-base/upload)
9. ⚠️ Knowledge base list/delete endpoints
10. ⚠️ Document processing with pgvector

---

## 🧪 **Testing Checklist**

### Knowledge Base:
- [ ] Upload PDF (max 10MB)
- [ ] List all documents
- [ ] Delete document
- [ ] Process document with pgvector
- [ ] AI uses documents for responses

### Notifications:
- [ ] Create notification on chat assignment
- [ ] Create notification on chat escalation
- [ ] Get notifications with unread count
- [ ] Mark single notification as read
- [ ] Mark all as read
- [ ] Delete notification
- [ ] Socket.IO notification event

### Chat Assignment:
- [ ] Assign chat to agent
- [ ] Reassign chat to different agent
- [ ] Get my assigned chats
- [ ] Notification sent to assigned agent
- [ ] Socket.IO assignment event

### Messages:
- [ ] Agent name appears in messages
- [ ] Timestamp displayed correctly
- [ ] Real-time message updates via Socket.IO

---

## 🔧 **Error Handling**

All endpoints should return consistent error format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common Error Codes:**
- 400: Bad Request (validation errors)
- 401: Unauthorized (not logged in)
- 403: Forbidden (insufficient permissions)
- 404: Not Found (resource doesn't exist)
- 500: Internal Server Error

---

## 📝 **Notes for Backend Implementation**

1. **Knowledge Base Processing:**
   - Use pgvector for document embeddings
   - Chunk documents into 500-1000 character segments
   - Store embeddings in PostgreSQL
   - Implement vector similarity search

2. **Notification System:**
   - Create notification on: assignment, escalation, new message
   - Delete old notifications after 30 days
   - Limit to 100 notifications per user

3. **Socket.IO:**
   - Authenticate socket connections
   - Join user-specific and chat-specific rooms
   - Emit events only to relevant users

4. **Performance:**
   - Add database indexes on foreign keys
   - Cache agent lists
   - Limit My Chats query to 20 results

---

**This document should be used as a reference when implementing backend endpoints for Admin Dashboard V2.0.**
