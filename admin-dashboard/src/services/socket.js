import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

let socket = null

export const initSocket = () => {
  const token = localStorage.getItem('chaty_admin_token') || window.CHATY_AUTH?.token;
  if (!socket) {
    socket = io(`${SOCKET_URL}/admin`, {
      autoConnect: false,
      auth: { token }
    })
  } else if (token && socket.auth?.token !== token) {
    socket.auth = { token };
  }
  return socket
}

export const connectSocket = () => {
  const s = initSocket()
  if (s && !s.connected) {
    s.connect()
  }
  return s
}

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect()
  }
}

export const getSocket = () => {
  if (!socket) {
    return initSocket()
  }
  return socket
}

export default {
  initSocket,
  connectSocket,
  disconnectSocket,
  getSocket,
}
