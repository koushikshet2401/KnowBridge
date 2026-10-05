import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

let socket = null

export const initSocket = () => {
  if (!socket) {
    const token = localStorage.getItem('knowbridge_admin_token') || window.KNOWBRIDGE_AUTH?.token;
    socket = io(`${SOCKET_URL}/admin`, {
      autoConnect: false,
      auth: { token }
    })
  }
  return socket
}

export const connectSocket = () => {
  if (socket && !socket.connected) {
    socket.connect()
  }
}

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect()
  }
}

export const getSocket = () => socket

export default {
  initSocket,
  connectSocket,
  disconnectSocket,
  getSocket,
}
