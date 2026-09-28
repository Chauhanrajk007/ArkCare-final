"use client";

import { io } from 'socket.io-client';

class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  /**
   * @param {string} sessionToken The `sc_session` cookie value. It is httpOnly,
   *   so it must be handed down by a server component / server action rather than
   *   read from `document.cookie`.
   */
  connect(sessionToken) {
    if (this.socket) {
      return this.socket;
    }

    // Determine the server origin: on a phone, "localhost" points at the
    // device itself, so fall back to the page's actual origin when it is not
    // loopback. This keeps localhost dev working and allows remote access.
    const pageOrigin =
      typeof window !== "undefined" ? window.location.origin : null;

    this.socket = io(pageOrigin && !pageOrigin.includes("localhost") && !pageOrigin.includes("127.0.0.1")
      ? pageOrigin
      : (process.env.NODE_ENV === 'production'
          ? process.env.NEXT_PUBLIC_APP_URL
          : 'http://localhost:3000'), {
      withCredentials: true,
      auth: {
        token: sessionToken,
      }
    });

    this.socket.on('connect', () => {
      console.log('Connected to socket server');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
      this.connected = false;
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  joinChat(chatId) {
    if (this.socket && this.connected) {
      this.socket.emit('join-chat', chatId);
    }
  }

  sendMessage(chatId, message, messageType = 'text') {
    if (this.socket && this.connected) {
      this.socket.emit('send-message', {
        chatId,
        message,
        messageType
      });
    }
  }

  markMessagesAsRead(chatId) {
    if (this.socket && this.connected) {
      this.socket.emit('mark-read', { chatId });
    }
  }

  setTyping(chatId, isTyping) {
    if (this.socket && this.connected) {
      this.socket.emit('typing', { chatId, isTyping });
    }
  }
}

const socketClient = new SocketClient();
export default socketClient;
