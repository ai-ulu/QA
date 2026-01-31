/**
 * WebSocket Manager for Real-time Communication
 * **Validates: Requirements 5.3**
 * 
 * Manages WebSocket connections for real-time test execution updates
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from './utils/logger';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  executionId?: string;
}

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
  lastPing: Date;
}

export class WebSocketManager extends EventEmitter {
  private server: WebSocket.Server | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(port: number = 8080) {
    super();
    this.setupWebSocketServer(port);
    this.startPingInterval();
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocketServer(port: number): void {
    this.server = new WebSocket.Server({ 
      port,
      perMessageDeflate: false,
      maxPayload: 1024 * 1024 // 1MB max message size
    });

    this.server.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.server.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });

    logger.info('WebSocket server started', { port });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    const client: ClientConnection = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      lastPing: new Date()
    };

    this.clients.set(clientId, client);

    logger.info('WebSocket client connected', { 
      clientId, 
      clientCount: this.clients.size 
    });

    // Setup message handler
    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    // Setup close handler
    ws.on('close', (code, reason) => {
      this.handleDisconnection(clientId, code, reason);
    });

    // Setup error handler
    ws.on('error', (error) => {
      logger.error('WebSocket client error', { 
        clientId, 
        error: error.message 
      });
    });

    // Setup ping/pong
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = new Date();
      }
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'welcome',
      data: { clientId },
      timestamp: new Date()
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: WebSocket.Data): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      const message = JSON.parse(data.toString());
      
      logger.debug('WebSocket message received', { 
        clientId, 
        type: message.type 
      });

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message.data);
          break;
        case 'authenticate':
          this.handleAuthentication(clientId, message.data);
          break;
        case 'ping':
          this.sendToClient(clientId, {
            type: 'pong',
            data: { timestamp: new Date() },
            timestamp: new Date()
          });
          break;
        default:
          logger.warn('Unknown WebSocket message type', { 
            clientId, 
            type: message.type 
          });
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message', { 
        clientId, 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      
      logger.info('WebSocket client disconnected', { 
        clientId, 
        code, 
        reason: reason.toString(),
        clientCount: this.clients.size 
      });
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscription(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const { executionId, userId } = data;

    if (executionId) {
      client.subscriptions.add(`execution:${executionId}`);
      logger.debug('Client subscribed to execution', { clientId, executionId });
    }

    if (userId) {
      client.subscriptions.add(`user:${userId}`);
      client.userId = userId;
      logger.debug('Client subscribed to user updates', { clientId, userId });
    }

    this.sendToClient(clientId, {
      type: 'subscription-confirmed',
      data: { executionId, userId },
      timestamp: new Date()
    });
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscription(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const { executionId, userId } = data;

    if (executionId) {
      client.subscriptions.delete(`execution:${executionId}`);
      logger.debug('Client unsubscribed from execution', { clientId, executionId });
    }

    if (userId) {
      client.subscriptions.delete(`user:${userId}`);
      logger.debug('Client unsubscribed from user updates', { clientId, userId });
    }

    this.sendToClient(clientId, {
      type: 'unsubscription-confirmed',
      data: { executionId, userId },
      timestamp: new Date()
    });
  }

  /**
   * Handle authentication
   */
  private handleAuthentication(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const { token, userId } = data;

    // In a real implementation, validate the token
    if (token && userId) {
      client.userId = userId;
      client.subscriptions.add(`user:${userId}`);
      
      this.sendToClient(clientId, {
        type: 'authentication-success',
        data: { userId },
        timestamp: new Date()
      });

      logger.info('Client authenticated', { clientId, userId });
    } else {
      this.sendToClient(clientId, {
        type: 'authentication-failed',
        data: { error: 'Invalid credentials' },
        timestamp: new Date()
      });
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Error sending message to client', { 
        clientId, 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Broadcast message to all subscribed clients
   */
  broadcast(type: string, data: any, executionId?: string): void {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date(),
      executionId
    };

    const subscription = executionId ? `execution:${executionId}` : null;

    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      // Check if client is subscribed to this execution or broadcast to all
      if (!subscription || client.subscriptions.has(subscription)) {
        this.sendToClient(clientId, message);
      }
    }

    logger.debug('Message broadcasted', { 
      type, 
      executionId, 
      clientCount: this.clients.size 
    });
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, type: string, data: any): void {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date()
    };

    for (const [clientId, client] of this.clients.entries()) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(clientId, message);
      }
    }

    logger.debug('Message sent to user', { userId, type });
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients subscribed to execution
   */
  getExecutionSubscribers(executionId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(`execution:${executionId}`)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 60 seconds

      for (const [clientId, client] of this.clients.entries()) {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check if client is still responsive
          if (now.getTime() - client.lastPing.getTime() > timeout) {
            logger.warn('Client ping timeout, terminating connection', { clientId });
            client.ws.terminate();
            this.clients.delete(clientId);
          } else {
            // Send ping
            client.ws.ping();
          }
        } else {
          // Remove dead connections
          this.clients.delete(clientId);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up WebSocket manager');

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Server shutdown');
      }
    }
    this.clients.clear();

    // Close server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
    }
  }
}