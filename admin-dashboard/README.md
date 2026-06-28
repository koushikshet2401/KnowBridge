# KnowBridge Admin Dashboard v2.0

Admin dashboard for managing the AI Support Chat System with advanced features.

## 🎉 **NEW in V2.0!**

- ✅ **Knowledge Base Management** - Upload and manage PDFs for AI training
- ✅ **Real-Time Notifications** - Live alerts for assignments and escalations  
- ✅ **Chat Assignment System** - Assign/reassign chats to agents with notifications
- ✅ **Agent Attribution** - See which agent replied to each message
- ✅ **My Chats Dashboard** - Agents see their assigned chats on dashboard
- ✅ **Socket.IO Integration** - Full real-time updates across all features

## 📋 Features

- **Dashboard** - Real-time statistics and analytics
- **Chat Management** - View and manage all conversations (Active, Pending, Closed)
- **Chat Detail** - Full conversation history with reply capability and agent assignment
- **Knowledge Base** - Upload and manage PDF documents for AI training
- **Team Management** - Add, edit, and manage support agents
- **Reviews & Feedback** - Track customer satisfaction
- **Notifications** - Real-time alerts for assignments, escalations, and new messages
- **Settings** - Configure application settings

## 🛠️ Tech Stack

- React 18.2.0
- Vite 5.0.8
- Tailwind CSS 3.4.0
- React Router 6.20.0
- Axios 1.6.2
- Socket.IO Client 4.5.4
- Recharts 2.10.3
- Lucide React (icons)
- date-fns (date formatting)

## 📦 Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Backend API running on port 5000

### Steps

1. **Extract the dashboard files**
   ```bash
   tar -xzf admin-dashboard.tar.gz
   cd admin-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables** (optional)
   
   Create a `.env` file in the root directory:
   ```env
   VITE_API_URL=http://localhost:5000
   ```
   
   If not set, it defaults to `http://localhost:5000`

4. **Start the development server**
   ```bash
   npm run dev
   ```
   
   The dashboard will be available at: **http://localhost:3000**

## 🔑 Default Login Credentials

- **Email:** admin@test.com
- **Password:** admin123

⚠️ **IMPORTANT:** Change these credentials in production!

## 🚀 Build for Production

```bash
npm run build
```

The production build will be in the `dist/` folder.

To preview the production build:
```bash
npm run preview
```

## 📁 Project Structure

```
admin-dashboard/
├── public/
├── src/
│   ├── components/
│   │   ├── Layout.jsx            # Sidebar layout with notifications
│   │   └── NotificationBell.jsx  # Real-time notification center (NEW!)
│   ├── pages/
│   │   ├── Login.jsx             # Login page
│   │   ├── Dashboard.jsx         # Dashboard with stats & My Chats
│   │   ├── Chats.jsx             # Chat list
│   │   ├── ChatDetail.jsx        # Chat view with assignment (ENHANCED!)
│   │   ├── KnowledgeBase.jsx     # PDF upload & management (NEW!)
│   │   ├── Team.jsx              # Agent management
│   │   ├── Reviews.jsx           # Feedback & reviews
│   │   └── Settings.jsx          # App settings
│   ├── services/
│   │   ├── api.js                # Axios instance
│   │   └── socket.js             # Socket.IO client (ENHANCED!)
│   ├── App.jsx                   # Main app with routing
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Global styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── README.md
├── CHANGELOG_V2.md               # What's new in V2.0 (NEW!)
└── BACKEND_API_REQUIREMENTS.md   # API endpoints needed (NEW!)
```

## 🔌 API Integration

The dashboard connects to the backend API at `http://localhost:5000/api`

**Required Backend Endpoints:**

### Authentication
- `POST /api/auth/login` - Admin login
- `GET /api/auth/me` - Get current user info

### Dashboard
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/dashboard/charts` - Chart data

### Chats
- `GET /api/admin/chats` - All chats
- `GET /api/admin/chats/active` - Active chats
- `GET /api/admin/chats/pending` - Pending chats
- `GET /api/admin/chats/closed` - Closed chats
- `GET /api/admin/chats/my-chats` - My assigned chats (NEW!)
- `GET /api/admin/chats/:chatId` - Chat details
- `POST /api/admin/chats/:chatId/reply` - Reply to chat
- `PATCH /api/admin/chats/:chatId/assign` - Assign chat to agent (NEW!)
- `POST /api/chat/:chatId/close` - Close chat

### Knowledge Base (NEW!)
- `GET /api/admin/knowledge-base` - List documents
- `POST /api/admin/knowledge-base/upload` - Upload PDF
- `DELETE /api/admin/knowledge-base/:docId` - Delete document

### Notifications (NEW!)
- `GET /api/admin/notifications` - Get notifications
- `PATCH /api/admin/notifications/:id/read` - Mark as read
- `POST /api/admin/notifications/mark-all-read` - Mark all as read
- `DELETE /api/admin/notifications/:id` - Delete notification

### Agents
- `GET /api/admin/agents` - List all agents
- `POST /api/admin/agents` - Create agent
- `DELETE /api/admin/agents/:agentId` - Delete agent

### Reviews
- `GET /api/admin/reviews` - All reviews
- `GET /api/admin/feedback/analysis` - Feedback stats

### Settings
- `GET /api/admin/settings` - Get settings
- `PUT /api/admin/settings` - Update settings

### Socket.IO Events (NEW!)
- `join-chat` - Join chat room
- `new-message` - New message event
- `chat-assigned` - Assignment notification
- `chat-escalated` - Escalation notification
- `notification` - General notification

**See `BACKEND_API_REQUIREMENTS.md` for detailed endpoint specifications.**

## 🎨 Customization

### Change Theme Colors

Edit `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        50: '#f0f9ff',
        // ... customize your colors
        900: '#0c4a6e',
      },
    },
  },
}
```

### Modify API URL

Edit `.env` file or update `src/services/api.js`:

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://your-api-url.com'
```

## 🔧 Development

### Run in development mode
```bash
npm run dev
```

### Build for production
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

## 📱 Features Overview

### 1. Dashboard
- Active, pending, and closed chat counts
- Agent statistics
- 7-day chat trend chart
- Performance metrics
- System status indicators

### 2. Chat Management
- Tabbed interface (All, Active, Pending, Closed)
- Search by name or email
- Real-time status updates
- Direct links to conversation details

### 3. Chat Detail
- Full conversation history
- Color-coded messages (User, AI, Agent)
- Reply functionality
- Close chat option
- Timestamp display

### 4. Team Management
- View all agents
- Add new agents
- Delete agents
- Role assignment (admin/agent)
- Status and availability tracking

### 5. Reviews & Feedback
- Positive/negative feedback counts
- Satisfaction rate percentage
- Star ratings display
- Customer comments

### 6. Settings
- Application name configuration
- Welcome message customization
- System information display

## 📱 Features Overview

### 1. Dashboard
- Active, pending, and closed chat counts
- Agent statistics
- 7-day chat trend chart
- Performance metrics
- System status indicators
- **NEW:** My Assigned Chats section (for agents)

### 2. Chat Management
- Tabbed interface (All, Active, Pending, Closed)
- Search by name or email
- Real-time status updates
- Direct links to conversation details

### 3. Chat Detail
- Full conversation history
- Color-coded messages (User, AI, Agent)
- **NEW:** Agent name and timestamp below each message
- **NEW:** Assignment dropdown to assign/reassign chats
- **NEW:** Real-time message updates via Socket.IO
- Reply functionality
- Close chat option

### 4. Knowledge Base (NEW!)
- Drag & drop PDF upload
- Document list with file size and status
- Delete documents
- Processing status tracking
- Integration with AI for intelligent responses

### 5. Team Management
- View all agents
- Add new agents
- Delete agents
- Role assignment (admin/agent)
- Status and availability tracking

### 6. Reviews & Feedback
- Positive/negative feedback counts
- Satisfaction rate percentage
- Star ratings display
- Customer comments

### 7. Notifications (NEW!)
- **Notification Bell** in header with unread count
- Real-time notifications for:
  - Chat assignments
  - Chat escalations from AI
  - New messages
  - System alerts
- Mark as read/unread
- Delete notifications
- Click to navigate to chat

### 8. Settings
- Application name configuration
- Welcome message customization
- System information display

## 🐛 Troubleshooting

### Port 3000 already in use
Change the port in `vite.config.js`:
```javascript
server: {
  port: 3001, // Change to any available port
}
```

### API Connection Failed
1. Ensure backend is running on port 5000
2. Check CORS settings in backend
3. Verify `.env` file has correct `VITE_API_URL`

### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 🔒 Security Notes

- Never commit `.env` files to version control
- Change default credentials in production
- Use HTTPS in production
- Implement proper authentication on backend
- Set up CORS properly for production domains

## 📞 Support

For issues or questions:
- Backend Repository: [Link to backend repo]
- Documentation: [Link to docs]

## 📄 License

Private - All rights reserved

---

**Built with ❤️ for KnowBridge AI Support System**
