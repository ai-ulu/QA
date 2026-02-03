// Service Worker registration and management utilities

export interface ServiceWorkerStatus {
  isSupported: boolean;
  isRegistered: boolean;
  isActive: boolean;
  registration: ServiceWorkerRegistration | null;
}

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor() {
    this.setupMessageListener();
  }

  // Register service worker
  async register(): Promise<ServiceWorkerStatus> {
    if (!('serviceWorker' in navigator)) {
      return {
        isSupported: false,
        isRegistered: false,
        isActive: false,
        registration: null,
      };
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is available
              this.emit('update-available', newWorker);
            }
          });
        }
      });

      // Handle controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.emit('controller-changed');
      });

      return {
        isSupported: true,
        isRegistered: true,
        isActive: !!this.registration.active,
        registration: this.registration,
      };
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return {
        isSupported: true,
        isRegistered: false,
        isActive: false,
        registration: null,
      };
    }
  }

  // Unregister service worker
  async unregister(): Promise<boolean> {
    if (this.registration) {
      try {
        const result = await this.registration.unregister();
        this.registration = null;
        return result;
      } catch (error) {
        console.error('Service worker unregistration failed:', error);
        return false;
      }
    }
    return false;
  }

  // Update service worker
  async update(): Promise<void> {
    if (this.registration) {
      await this.registration.update();
    }
  }

  // Skip waiting for new service worker
  async skipWaiting(): Promise<void> {
    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Get background sync queue status
  async getQueueStatus(): Promise<any> {
    return this.sendMessage('GET_QUEUE_STATUS');
  }

  // Clear all caches
  async clearCache(): Promise<void> {
    return this.sendMessage('CLEAR_CACHE');
  }

  // Send message to service worker
  private async sendMessage(type: string, data?: any): Promise<any> {
    if (!this.registration?.active) {
      throw new Error('No active service worker');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      this.registration!.active!.postMessage(
        { type, data },
        [messageChannel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Service worker message timeout'));
      }, 5000);
    });
  }

  // Setup message listener for SW messages
  private setupMessageListener(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, data } = event.data;
        this.emit(type, data);
      });
    }
  }

  // Event emitter methods
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Get current status
  getStatus(): ServiceWorkerStatus {
    return {
      isSupported: 'serviceWorker' in navigator,
      isRegistered: !!this.registration,
      isActive: !!this.registration?.active,
      registration: this.registration,
    };
  }
}

// Global service worker manager instance
export const serviceWorkerManager = new ServiceWorkerManager();

// Utility functions
export const registerServiceWorker = () => serviceWorkerManager.register();
export const unregisterServiceWorker = () => serviceWorkerManager.unregister();
export const updateServiceWorker = () => serviceWorkerManager.update();
export const skipWaitingServiceWorker = () => serviceWorkerManager.skipWaiting();