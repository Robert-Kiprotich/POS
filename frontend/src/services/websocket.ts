/**
 * WebSocket Service for Real-time Inbox Updates
 * Connects to Django Channels and listens for new messages
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectInterval = 3000;
    this.reconnectTimer = null;
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.errorHandlers = [];
    this.isConnected = false;
    this.shouldReconnect = true;
  }

  /**
   * Connect to WebSocket server
   * @param {string} token - Authentication token (optional for now)
   */
  connect(token = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    // Auto-detect WebSocket URL from current window location.
    // Works on localhost, ngrok, staging and production without any code changes.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/inbox/`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.notifyConnectionHandlers(true);
        
        // Clear any reconnect timers
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.notifyErrorHandlers(error);
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.notifyConnectionHandlers(false);
        
        // Attempt to reconnect if shouldReconnect is true
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    console.log(`🔄 Reconnecting in ${this.reconnectInterval / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Object} data - Message data
   */
  handleMessage(data) {
    switch (data.type) {
      case 'connected':
        console.log('🎉 Server confirmed connection:', data.message);
        break;
      
      case 'new_message':
        console.log('💬 New message event:', data);
        this.notifyMessageHandlers(data);
        break;
      
      case 'message_read':
        console.log('✓ Message read event:', data);
        this.notifyMessageHandlers(data);
        break;
      
      case 'typing_indicator':
        console.log('⌨️ Typing indicator:', data);
        this.notifyMessageHandlers(data);
        break;
      
      case 'case_assigned':
        console.log('📋 Case assigned:', data);
        this.notifyMessageHandlers(data);
        break;
      
      default:
        console.log('📩 Unknown message type:', data.type, data);
        this.notifyMessageHandlers(data);
    }
  }

  /**
   * Register a message handler
   * @param {Function} handler - Callback function
   * @returns {Function} Unregister function
   */
  onMessage(handler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Register a connection state handler
   * @param {Function} handler - Callback function
   * @returns {Function} Unregister function
   */
  onConnection(handler) {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Register an error handler
   * @param {Function} handler - Callback function
   * @returns {Function} Unregister function
   */
  onError(handler) {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Notify all message handlers
   * @param {Object} data - Message data
   */
  notifyMessageHandlers(data) {
    this.messageHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  /**
   * Notify all connection handlers
   * @param {boolean} connected - Connection state
   */
  notifyConnectionHandlers(connected) {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  /**
   * Notify all error handlers
   * @param {Error} error - Error object
   */
  notifyErrorHandlers(error) {
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (err) {
        console.error('Error in error handler:', err);
      }
    });
  }

  /**
   * Send message through WebSocket (if supported by server)
   * @param {Object} data - Message data
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected');
    }
  }
}

// Export singleton instance
const wsService = new WebSocketService();
export default wsService;
