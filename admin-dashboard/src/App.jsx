import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Chats from './pages/Chats'
import ChatDetail from './pages/ChatDetail'
import KnowledgeBase from './pages/KnowledgeBase'
import Team from './pages/Team'
import Reviews from './pages/Reviews'
import Settings from './pages/Settings'
import Login from './pages/Login'

// Simple Protected Route component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('knowbridge_admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout><Outlet /></Layout>
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chats" element={<Chats />} />
          <Route path="chats/:chatId" element={<ChatDetail />} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="team" element={<Team />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        
        {/* Catch all unknown routes */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App