import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Star,
  Settings as SettingsIcon,
  Menu,
  X,
  BookOpen,
  LogOut,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import { initSocket, connectSocket, disconnectSocket } from '../services/socket'

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  
  const user = JSON.parse(localStorage.getItem('knowbridge_admin_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('knowbridge_admin_token');
    localStorage.removeItem('knowbridge_admin_user');
    disconnectSocket();
    navigate('/login');
  };

  useEffect(() => {
    // Initialize and connect Socket.IO when layout mounts
    initSocket()
    connectSocket()

    return () => {
      disconnectSocket()
    }
  }, [])

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Chats', href: '/chats', icon: MessageSquare },
    { name: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen },
    { name: 'Team', href: '/team', icon: Users },
    { name: 'Reviews', href: '/reviews', icon: Star },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ]

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-6 border-b">
            <h1 className="text-xl font-bold text-primary-600">Support Staff Panel</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-4 py-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer info (optional - can be removed) */}
          <div className="border-t p-4">
            <div className="px-4 py-2 text-xs text-gray-500">
              Embedded in KnowBridge
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-16 items-center justify-between bg-white px-6 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center space-x-6 ml-auto">
            <span className="text-sm text-gray-600 hidden md:inline">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <div className="h-6 w-px bg-gray-200 hidden md:block"></div>
            <div className="flex items-center space-x-3">
              <div className="flex flex-col items-end mr-2">
                <span className="text-sm font-medium text-gray-900">{user.name || 'Staff User'}</span>
                <span className="text-xs text-gray-500 capitalize">{user.role?.replace('_', ' ') || 'Staff'}</span>
              </div>
              <NotificationBell />
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                title="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

export default Layout