import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { EventEmitter } from 'events'

/**
 * Property-Based Tests for Room/Channel Subscription Management
 * 
 * **Validates: Requirements Real-time Systems - Subscription Management**
 * 
 * These tests ensure that:
 * - Unsubscribe always stops message delivery
 * - Subscription count never grows unbounded
 * - Permission-based subscription filtering works
 */

interface Subscription {
  id: string
  userId: string
  channelId: string
  permissions: string[]
  filters: Record<string, any>
  createdAt: number
  lastActivity: number
}

interface Channel {
  id: string
  name: string
  type: 'public' | 'private' | 'direct'
  permissions: {
    read: string[]
    write: string[]
    admin: string[]
  }
  metadata: Record<string, any>
}

interface Message {
  id: string
  channelId: string
  userId: string
  type: string
  content: any
  timestamp: number
  permissions?: string[]
}

class SubscriptionManager extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map()
  private channels: Map<string, Channel> = new Map()
  private userSubscriptions: Map<string, Set<string>> = new Map() // userId -> subscriptionIds
  private channelSubscriptions: Map<string, Set<string>> = new Map() // channelId -> subscriptionIds
  
  private config: {
    maxSubscriptionsPerUser: number
    maxSubscriptionsPerChannel: number
    subscriptionTimeout: number
    cleanupInterval: number
  }

  private cleanupTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<SubscriptionManager['config']> = {}) {
    super()
    
    this.config = {
      maxSubscriptionsPerUser: 100,
      maxSubscriptionsPerChannel: 10000,
      subscriptionTimeout: 30 * 60 * 1000, // 30 minutes
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      ...config
    }

    this.startCleanupTimer()
  }

  createChannel(channel: Omit<Channel, 'id'>): Channel {
    const id = this.generateId()
    const newChannel: Channel = { ...channel, id }
    
    this.channels.set(id, newChannel)
    this.channelSubscriptions.set(id, new Set())
    
    this.emit('channelCreated', { channel: newChannel })
    return newChannel
  }

  subscribe(
    userId: string, 
    channelId: string, 
    permissions: string[] = ['read'],
    filters: Record<string, any> = {}
  ): { success: boolean; subscription?: Subscription; error?: string } {
    
    // Check if channel exists
    const channel = this.channels.get(channelId)
    if (!channel) {
      return { success: false, error: 'Channel not found' }
    }

    // Check user subscription limits
    const userSubs = this.userSubscriptions.get(userId) || new Set()
    if (userSubs.size >= this.config.maxSubscriptionsPerUser) {
      return { success: false, error: 'User subscription limit exceeded' }
    }

    // Check channel subscription limits
    const channelSubs = this.channelSubscriptions.get(channelId) || new Set()
    if (channelSubs.size >= this.config.maxSubscriptionsPerChannel) {
      return { success: false, error: 'Channel subscription limit exceeded' }
    }

    // Check permissions
    if (!this.hasChannelPermission(userId, channel, 'read')) {
      return { success: false, error: 'Insufficient permissions' }
    }

    // Create subscription
    const subscription: Subscription = {
      id: this.generateId(),
      userId,
      channelId,
      permissions,
      filters,
      createdAt: Date.now(),
      lastActivity: Date.now()
    }

    // Store subscription
    this.subscriptions.set(subscription.id, subscription)
    
    // Update indexes
    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set())
    }
    this.userSubscriptions.get(userId)!.add(subscription.id)
    this.channelSubscriptions.get(channelId)!.add(subscription.id)

    this.emit('subscribed', { subscription })
    return { success: true, subscription }
  }

  unsubscribe(subscriptionId: string): { success: boolean; error?: string } {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) {
      return { success: false, error: 'Subscription not found' }
    }

    // Remove from all indexes
    this.subscriptions.delete(subscriptionId)
    
    const userSubs = this.userSubscriptions.get(subscription.userId)
    if (userSubs) {
      userSubs.delete(subscriptionId)
      if (userSubs.size === 0) {
        this.userSubscriptions.delete(subscription.userId)
      }
    }

    const channelSubs = this.channelSubscriptions.get(subscription.channelId)
    if (channelSubs) {
      channelSubs.delete(subscriptionId)
    }

    this.emit('unsubscribed', { subscription })
    return { success: true }
  }

  unsubscribeUser(userId: string): number {
    const userSubs = this.userSubscriptions.get(userId)
    if (!userSubs) {
      return 0
    }

    let unsubscribedCount = 0
    const subscriptionIds = Array.from(userSubs)
    
    subscriptionIds.forEach(subId => {
      const result = this.unsubscribe(subId)
      if (result.success) {
        unsubscribedCount++
      }
    })

    return unsubscribedCount
  }

  broadcastMessage(message: Message): number {
    const channelSubs = this.channelSubscriptions.get(message.channelId)
    if (!channelSubs) {
      return 0
    }

    let deliveredCount = 0
    
    channelSubs.forEach(subId => {
      const subscription = this.subscriptions.get(subId)
      if (subscription && this.shouldDeliverMessage(subscription, message)) {
        // Update last activity
        subscription.lastActivity = Date.now()
        
        this.emit('messageDelivered', { 
          subscription, 
          message,
          userId: subscription.userId 
        })
        deliveredCount++
      }
    })

    return deliveredCount
  }

  private shouldDeliverMessage(subscription: Subscription, message: Message): boolean {
    // Check permissions
    if (message.permissions && message.permissions.length > 0) {
      const hasPermission = message.permissions.some(perm => 
        subscription.permissions.includes(perm)
      )
      if (!hasPermission) {
        return false
      }
    }

    // Apply filters
    for (const [filterKey, filterValue] of Object.entries(subscription.filters)) {
      if (message.content && message.content[filterKey] !== filterValue) {
        return false
      }
    }

    return true
  }

  private hasChannelPermission(userId: string, channel: Channel, permission: string): boolean {
    // For public channels, everyone has read permission
    if (channel.type === 'public' && permission === 'read') {
      return true
    }

    // Check specific permissions
    const permissionList = channel.permissions[permission as keyof typeof channel.permissions]
    return permissionList.includes(userId) || permissionList.includes('*')
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSubscriptions()
    }, this.config.cleanupInterval)
  }

  private cleanupInactiveSubscriptions(): void {
    const now = Date.now()
    const expiredSubscriptions: string[] = []

    this.subscriptions.forEach((subscription, id) => {
      if (now - subscription.lastActivity > this.config.subscriptionTimeout) {
        expiredSubscriptions.push(id)
      }
    })

    let cleanedCount = 0
    expiredSubscriptions.forEach(subId => {
      const result = this.unsubscribe(subId)
      if (result.success) {
        cleanedCount++
      }
    })

    if (cleanedCount > 0) {
      this.emit('subscriptionsCleanedUp', { count: cleanedCount })
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15)
  }

  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId)
  }

  getUserSubscriptions(userId: string): Subscription[] {
    const userSubs = this.userSubscriptions.get(userId)
    if (!userSubs) {
      return []
    }

    return Array.from(userSubs)
      .map(subId => this.subscriptions.get(subId))
      .filter((sub): sub is Subscription => sub !== undefined)
  }

  getChannelSubscriptions(channelId: string): Subscription[] {
    const channelSubs = this.channelSubscriptions.get(channelId)
    if (!channelSubs) {
      return []
    }

    return Array.from(channelSubs)
      .map(subId => this.subscriptions.get(subId))
      .filter((sub): sub is Subscription => sub !== undefined)
  }

  getStats() {
    return {
      totalSubscriptions: this.subscriptions.size,
      totalChannels: this.channels.size,
      totalUsers: this.userSubscriptions.size,
      averageSubscriptionsPerUser: this.userSubscriptions.size > 0 
        ? this.subscriptions.size / this.userSubscriptions.size 
        : 0,
      averageSubscriptionsPerChannel: this.channels.size > 0
        ? this.subscriptions.size / this.channels.size
        : 0
    }
  }

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}

describe('Subscription Management Property Tests', () => {
  let subscriptionManager: SubscriptionManager

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager({
      maxSubscriptionsPerUser: 100, // Increased for testing
      maxSubscriptionsPerChannel: 1000,
      subscriptionTimeout: 10000, // 10 seconds for testing
      cleanupInterval: 2000 // 2 seconds for testing
    })
  })

  afterEach(() => {
    subscriptionManager.shutdown()
  })

  /**
   * Property Test: Unsubscribe always stops message delivery
   * **Validates: Requirements Real-time Systems - Subscription Management**
   */
  it('should stop message delivery after unsubscribe', () => {
    fc.assert(
      fc.property(
        fc.record({
          userCount: fc.integer({ min: 5, max: 20 }),
          channelCount: fc.integer({ min: 2, max: 10 }),
          messageCount: fc.integer({ min: 10, max: 50 }),
          unsubscribeRatio: fc.float({ min: Math.fround(0.2), max: Math.fround(0.8) })
        }),
        ({ userCount, channelCount, messageCount, unsubscribeRatio }: {
          userCount: number
          channelCount: number
          messageCount: number
          unsubscribeRatio: number
        }) => {
          const deliveredMessages: any[] = []
          
          subscriptionManager.on('messageDelivered', (event) => {
            deliveredMessages.push(event)
          })

          // Create channels
          const channels: Channel[] = []
          for (let i = 0; i < channelCount; i++) {
            const channel = subscriptionManager.createChannel({
              name: `channel-${i}`,
              type: 'public',
              permissions: { read: ['*'], write: ['*'], admin: [] },
              metadata: {}
            })
            channels.push(channel)
          }

          // Create subscriptions
          const subscriptions: Subscription[] = []
          for (let i = 0; i < userCount; i++) {
            const userId = `user-${i}`
            const channelId = channels[i % channels.length]?.id
            if (!channelId) continue
            
            const result = subscriptionManager.subscribe(userId, channelId)
            if (result.success && result.subscription) {
              subscriptions.push(result.subscription)
            }
          }

          // Send initial messages
          channels.forEach(channel => {
            for (let i = 0; i < messageCount; i++) {
              const message: Message = {
                id: `msg-${channel.id}-${i}`,
                channelId: channel.id,
                userId: 'sender',
                type: 'text',
                content: { text: `Message ${i}` },
                timestamp: Date.now()
              }
              subscriptionManager.broadcastMessage(message)
            }
          })

          const afterInitialMessages = deliveredMessages.length

          // Unsubscribe some users
          const unsubscribeCount = Math.floor(subscriptions.length * unsubscribeRatio)
          const unsubscribedIds: string[] = []
          
          for (let i = 0; i < unsubscribeCount; i++) {
            const subscription = subscriptions[i]
            if (subscription) {
              subscriptionManager.unsubscribe(subscription.id)
              unsubscribedIds.push(subscription.userId)
            }
          }

          // Send more messages
          channels.forEach(channel => {
            for (let i = 0; i < messageCount; i++) {
              const message: Message = {
                id: `msg-after-unsub-${channel.id}-${i}`,
                channelId: channel.id,
                userId: 'sender',
                type: 'text',
                content: { text: `After unsubscribe ${i}` },
                timestamp: Date.now()
              }
              subscriptionManager.broadcastMessage(message)
            }
          })

          // Verify unsubscribed users don't receive new messages
          const messagesAfterUnsub = deliveredMessages.slice(afterInitialMessages)
          const unsubscribedUserMessages = messagesAfterUnsub.filter(event => 
            unsubscribedIds.includes(event.userId)
          )

          expect(unsubscribedUserMessages.length).toBe(0)

          return true
        }
      ),
      { numRuns: 8 }
    )
  })

  /**
   * Property Test: Subscription count never grows unbounded
   * **Validates: Requirements Real-time Systems - Subscription Management**
   */
  it('should enforce subscription limits and prevent unbounded growth', () => {
    fc.assert(
      fc.property(
        fc.record({
          userCount: fc.integer({ min: 10, max: 30 }),
          subscriptionsPerUser: fc.integer({ min: 60, max: 100 }), // Exceed limit of 50
          channelCount: fc.integer({ min: 5, max: 15 })
        }),
        ({ userCount, subscriptionsPerUser, channelCount }: {
          userCount: number
          subscriptionsPerUser: number
          channelCount: number
        }) => {
          // Create channels
          const channels: Channel[] = []
          for (let i = 0; i < channelCount; i++) {
            const channel = subscriptionManager.createChannel({
              name: `channel-${i}`,
              type: 'public',
              permissions: { read: ['*'], write: ['*'], admin: [] },
              metadata: {}
            })
            channels.push(channel)
          }

          // Try to create many subscriptions per user
          let totalAttempts = 0
          let totalSuccessful = 0
          let limitExceededCount = 0

          for (let u = 0; u < userCount; u++) {
            const userId = `user-${u}`
            
            for (let s = 0; s < subscriptionsPerUser; s++) {
              const channelId = channels[s % channels.length]?.id
              if (!channelId) continue
              totalAttempts++
              
              const result = subscriptionManager.subscribe(userId, channelId)
              if (result.success) {
                totalSuccessful++
              } else if (result.error?.includes('limit exceeded')) {
                limitExceededCount++
              }
            }
          }

          const stats = subscriptionManager.getStats()

          // Verify limits are enforced
          expect(stats.totalSubscriptions).toBeLessThanOrEqual(userCount * 100) // Max 100 per user
          expect(limitExceededCount).toBeGreaterThan(0) // Should have hit limits
          
          // Verify no user has more than the limit
          for (let u = 0; u < userCount; u++) {
            const userId = `user-${u}`
            const userSubs = subscriptionManager.getUserSubscriptions(userId)
            expect(userSubs.length).toBeLessThanOrEqual(100)
          }

          return true
        }
      ),
      { numRuns: 6 }
    )
  })

  /**
   * Property Test: Permission-based subscription filtering works
   * **Validates: Requirements Real-time Systems - Subscription Management**
   */
  it('should filter subscriptions and messages based on permissions', () => {
    fc.assert(
      fc.property(
        fc.record({
          userCount: fc.integer({ min: 5, max: 15 }),
          messageCount: fc.integer({ min: 10, max: 30 }),
          permissionTypes: fc.array(
            fc.oneof(fc.constant('read'), fc.constant('write'), fc.constant('admin')),
            { minLength: 1, maxLength: 3 }
          )
        }),
        ({ userCount, messageCount, permissionTypes }: {
          userCount: number
          messageCount: number
          permissionTypes: string[]
        }) => {
          const deliveredMessages: any[] = []
          
          subscriptionManager.on('messageDelivered', (event) => {
            deliveredMessages.push(event)
          })

          // Create private channel with specific permissions
          const authorizedUsers = [`user-0`, `user-1`] // Only first 2 users authorized
          const channel = subscriptionManager.createChannel({
            name: 'private-channel',
            type: 'private',
            permissions: { 
              read: authorizedUsers, 
              write: authorizedUsers, 
              admin: ['user-0'] 
            },
            metadata: {}
          })

          // Try to subscribe all users
          const subscriptionResults: any[] = []
          for (let i = 0; i < userCount; i++) {
            const userId = `user-${i}`
            const result = subscriptionManager.subscribe(userId, channel.id, permissionTypes)
            subscriptionResults.push({ userId, result })
          }

          // Only authorized users should be able to subscribe
          const successfulSubs = subscriptionResults.filter(r => r.result.success)
          const failedSubs = subscriptionResults.filter(r => !r.result.success)

          expect(successfulSubs.length).toBeLessThanOrEqual(authorizedUsers.length)
          expect(failedSubs.length).toBeGreaterThan(0)

          // Send messages with different permission requirements
          for (let i = 0; i < messageCount; i++) {
            const message: Message = {
              id: `msg-${i}`,
              channelId: channel.id,
              userId: 'sender',
              type: 'text',
              content: { text: `Message ${i}` },
              timestamp: Date.now(),
              permissions: i % 2 === 0 ? ['read'] : ['admin'] // Alternate permissions
            }
            subscriptionManager.broadcastMessage(message)
          }

          // Verify only users with appropriate permissions received messages
          const adminMessages = deliveredMessages.filter(event => 
            event.message.permissions?.includes('admin')
          )
          
          // Admin messages should only go to admin users
          adminMessages.forEach(event => {
            const subscription = subscriptionManager.getSubscription(event.subscription.id)
            if (subscription) {
              expect(subscription.permissions.includes('admin')).toBe(true)
            }
          })

          return true
        }
      ),
      { numRuns: 8 }
    )
  })
})

describe('Subscription Management Unit Tests', () => {
  let subscriptionManager: SubscriptionManager

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager()
  })

  afterEach(() => {
    subscriptionManager.shutdown()
  })

  /**
   * Unit Test: Basic subscription lifecycle
   */
  it('should handle basic subscription lifecycle', () => {
    // Create channel
    const channel = subscriptionManager.createChannel({
      name: 'test-channel',
      type: 'public',
      permissions: { read: ['*'], write: ['*'], admin: [] },
      metadata: {}
    })

    // Subscribe user
    const result = subscriptionManager.subscribe('user1', channel.id)
    expect(result.success).toBe(true)
    expect(result.subscription).toBeDefined()

    // Verify subscription exists
    const subscription = subscriptionManager.getSubscription(result.subscription!.id)
    expect(subscription).toBeDefined()
    expect(subscription!.userId).toBe('user1')
    expect(subscription!.channelId).toBe(channel.id)

    // Unsubscribe
    const unsubResult = subscriptionManager.unsubscribe(result.subscription!.id)
    expect(unsubResult.success).toBe(true)

    // Verify subscription is removed
    const removedSub = subscriptionManager.getSubscription(result.subscription!.id)
    expect(removedSub).toBeUndefined()
  })

  /**
   * Unit Test: Message filtering by subscription filters
   */
  it('should filter messages based on subscription filters', () => {
    const deliveredMessages: any[] = []
    
    subscriptionManager.on('messageDelivered', (event) => {
      deliveredMessages.push(event)
    })

    // Create channel
    const channel = subscriptionManager.createChannel({
      name: 'filtered-channel',
      type: 'public',
      permissions: { read: ['*'], write: ['*'], admin: [] },
      metadata: {}
    })

    // Subscribe with filter
    const result = subscriptionManager.subscribe('user1', channel.id, ['read'], {
      category: 'important'
    })
    expect(result.success).toBe(true)

    // Send matching message
    const matchingMessage: Message = {
      id: 'msg1',
      channelId: channel.id,
      userId: 'sender',
      type: 'text',
      content: { category: 'important', text: 'Important message' },
      timestamp: Date.now()
    }
    subscriptionManager.broadcastMessage(matchingMessage)

    // Send non-matching message
    const nonMatchingMessage: Message = {
      id: 'msg2',
      channelId: channel.id,
      userId: 'sender',
      type: 'text',
      content: { category: 'normal', text: 'Normal message' },
      timestamp: Date.now()
    }
    subscriptionManager.broadcastMessage(nonMatchingMessage)

    // Only matching message should be delivered
    expect(deliveredMessages.length).toBe(1)
    expect(deliveredMessages[0].message.id).toBe('msg1')
  })

  /**
   * Unit Test: User unsubscribe all
   */
  it('should unsubscribe user from all channels', () => {
    // Create multiple channels
    const channels = []
    for (let i = 0; i < 3; i++) {
      const channel = subscriptionManager.createChannel({
        name: `channel-${i}`,
        type: 'public',
        permissions: { read: ['*'], write: ['*'], admin: [] },
        metadata: {}
      })
      channels.push(channel)
    }

    // Subscribe user to all channels
    channels.forEach(channel => {
      subscriptionManager.subscribe('user1', channel.id)
    })

    // Verify user has 3 subscriptions
    let userSubs = subscriptionManager.getUserSubscriptions('user1')
    expect(userSubs.length).toBe(3)

    // Unsubscribe user from all
    const unsubscribedCount = subscriptionManager.unsubscribeUser('user1')
    expect(unsubscribedCount).toBe(3)

    // Verify user has no subscriptions
    userSubs = subscriptionManager.getUserSubscriptions('user1')
    expect(userSubs.length).toBe(0)
  })

  /**
   * Unit Test: Channel subscription limits
   */
  it('should enforce channel subscription limits', () => {
    // Create manager with low channel limit
    subscriptionManager.shutdown()
    subscriptionManager = new SubscriptionManager({
      maxSubscriptionsPerChannel: 3
    })

    // Create channel
    const channel = subscriptionManager.createChannel({
      name: 'limited-channel',
      type: 'public',
      permissions: { read: ['*'], write: ['*'], admin: [] },
      metadata: {}
    })

    // Subscribe up to limit
    for (let i = 0; i < 3; i++) {
      const result = subscriptionManager.subscribe(`user${i}`, channel.id)
      expect(result.success).toBe(true)
    }

    // Try to exceed limit
    const result = subscriptionManager.subscribe('user3', channel.id)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Channel subscription limit exceeded')
  })

  /**
   * Unit Test: Subscription cleanup
   */
  it('should cleanup inactive subscriptions', async () => {
    // Create manager with short timeout
    subscriptionManager.shutdown()
    subscriptionManager = new SubscriptionManager({
      subscriptionTimeout: 1000, // 1 second
      cleanupInterval: 500 // 0.5 seconds
    })

    const cleanupEvents: any[] = []
    subscriptionManager.on('subscriptionsCleanedUp', (event) => {
      cleanupEvents.push(event)
    })

    // Create channel and subscription
    const channel = subscriptionManager.createChannel({
      name: 'cleanup-channel',
      type: 'public',
      permissions: { read: ['*'], write: ['*'], admin: [] },
      metadata: {}
    })

    const result = subscriptionManager.subscribe('user1', channel.id)
    expect(result.success).toBe(true)

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Should have cleaned up inactive subscription
    expect(cleanupEvents.length).toBeGreaterThan(0)
    
    const subscription = subscriptionManager.getSubscription(result.subscription!.id)
    expect(subscription).toBeUndefined()
  })

  /**
   * Unit Test: Statistics tracking
   */
  it('should track subscription statistics correctly', () => {
    // Create channels and subscriptions
    const channels = []
    for (let i = 0; i < 2; i++) {
      const channel = subscriptionManager.createChannel({
        name: `stats-channel-${i}`,
        type: 'public',
        permissions: { read: ['*'], write: ['*'], admin: [] },
        metadata: {}
      })
      channels.push(channel)
    }

    // Create subscriptions
    for (let u = 0; u < 3; u++) {
      for (let c = 0; c < 2; c++) {
        subscriptionManager.subscribe(`user${u}`, channels[c]?.id || '')
      }
    }

    const stats = subscriptionManager.getStats()
    
    expect(stats.totalSubscriptions).toBe(6) // 3 users × 2 channels
    expect(stats.totalChannels).toBe(2)
    expect(stats.totalUsers).toBe(3)
    expect(stats.averageSubscriptionsPerUser).toBe(2)
    expect(stats.averageSubscriptionsPerChannel).toBe(3)
  })
})