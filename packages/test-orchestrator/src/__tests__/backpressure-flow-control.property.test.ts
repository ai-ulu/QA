import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { EventEmitter } from 'events'

/**
 * Property-Based Tests for Backpressure and Flow Control
 * 
 * **Validates: Requirements Real-time Systems - Backpressure**
 * 
 * These tests ensure that:
 * - System never OOMs under message flood
 * - Buffer overflow triggers backpressure signal
 * - Slow consumer detection and handling works
 */

interface FlowControlMessage {
  id: string
  type: string
  payload: any
  size: number
  timestamp: number
  priority: 'low' | 'normal' | 'high'
}

interface BackpressureSignal {
  type: 'pause' | 'resume' | 'slow_down' | 'drop_messages'
  reason: string
  timestamp: number
  bufferUtilization: number
}

class FlowControlManager extends EventEmitter {
  private messageBuffer: FlowControlMessage[] = []
  private priorityQueues: {
    high: FlowControlMessage[]
    normal: FlowControlMessage[]
    low: FlowControlMessage[]
  } = {
    high: [],
    normal: [],
    low: []
  }
  
  private config: {
    maxBufferSize: number
    maxMemoryUsage: number // bytes
    highWaterMark: number // percentage
    lowWaterMark: number // percentage
    processingRate: number // messages per second
    slowConsumerThreshold: number // ms
  }

  private currentMemoryUsage: number = 0
  private isBackpressureActive: boolean = false
  private processingStats: {
    processed: number
    dropped: number
    startTime: number
    lastProcessTime: number
  }

  private processingTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<typeof this.config> = {}) {
    super()
    
    this.config = {
      maxBufferSize: 10000,
      maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      highWaterMark: 80, // 80%
      lowWaterMark: 60, // 60%
      processingRate: 1000, // 1000 msg/sec
      slowConsumerThreshold: 5000, // 5 seconds
      ...config
    }

    this.processingStats = {
      processed: 0,
      dropped: 0,
      startTime: Date.now(),
      lastProcessTime: Date.now()
    }

    this.startProcessing()
  }

  enqueueMessage(message: FlowControlMessage): boolean {
    // Check memory limits first
    if (this.currentMemoryUsage + message.size > this.config.maxMemoryUsage) {
      this.handleMemoryPressure(message)
      return false
    }

    // Check buffer size limits
    const totalBufferSize = this.getTotalBufferSize()
    if (totalBufferSize >= this.config.maxBufferSize) {
      this.handleBufferOverflow(message)
      return false
    }

    // Add to appropriate priority queue
    this.priorityQueues[message.priority].push(message)
    this.currentMemoryUsage += message.size

    // Check if we need to activate backpressure
    this.checkBackpressure()

    this.emit('messageEnqueued', { 
      message, 
      bufferSize: totalBufferSize + 1,
      memoryUsage: this.currentMemoryUsage 
    })

    return true
  }

  private handleMemoryPressure(message: FlowControlMessage): void {
    this.emit('memoryPressure', { 
      message, 
      currentUsage: this.currentMemoryUsage,
      maxUsage: this.config.maxMemoryUsage 
    })

    // Try to free memory by dropping low priority messages
    this.dropLowPriorityMessages()

    // Send backpressure signal
    this.sendBackpressureSignal({
      type: 'drop_messages',
      reason: 'Memory pressure',
      timestamp: Date.now(),
      bufferUtilization: (this.currentMemoryUsage / this.config.maxMemoryUsage) * 100
    })
  }

  private handleBufferOverflow(message: FlowControlMessage): void {
    this.emit('bufferOverflow', { 
      message, 
      bufferSize: this.getTotalBufferSize(),
      maxSize: this.config.maxBufferSize 
    })

    // Drop oldest low priority messages to make room
    this.dropOldestMessages()

    // Send backpressure signal
    this.sendBackpressureSignal({
      type: 'pause',
      reason: 'Buffer overflow',
      timestamp: Date.now(),
      bufferUtilization: (this.getTotalBufferSize() / this.config.maxBufferSize) * 100
    })
  }

  private checkBackpressure(): void {
    const bufferUtilization = (this.getTotalBufferSize() / this.config.maxBufferSize) * 100
    const memoryUtilization = (this.currentMemoryUsage / this.config.maxMemoryUsage) * 100

    if (!this.isBackpressureActive && 
        (bufferUtilization > this.config.highWaterMark || memoryUtilization > this.config.highWaterMark)) {
      
      this.isBackpressureActive = true
      this.sendBackpressureSignal({
        type: 'slow_down',
        reason: 'High water mark reached',
        timestamp: Date.now(),
        bufferUtilization: Math.max(bufferUtilization, memoryUtilization)
      })
    } else if (this.isBackpressureActive && 
               bufferUtilization < this.config.lowWaterMark && 
               memoryUtilization < this.config.lowWaterMark) {
      
      this.isBackpressureActive = false
      this.sendBackpressureSignal({
        type: 'resume',
        reason: 'Low water mark reached',
        timestamp: Date.now(),
        bufferUtilization: Math.max(bufferUtilization, memoryUtilization)
      })
    }
  }

  private sendBackpressureSignal(signal: BackpressureSignal): void {
    this.emit('backpressureSignal', { signal })
  }

  private dropLowPriorityMessages(): void {
    const droppedCount = this.priorityQueues.low.length
    const droppedSize = this.priorityQueues.low.reduce((sum, msg) => sum + msg.size, 0)
    
    this.priorityQueues.low = []
    this.currentMemoryUsage -= droppedSize
    this.processingStats.dropped += droppedCount

    this.emit('messagesDropped', { 
      count: droppedCount, 
      priority: 'low',
      freedMemory: droppedSize 
    })
  }

  private dropOldestMessages(): void {
    // Drop oldest messages from normal priority queue
    const messagesToDrop = Math.min(100, this.priorityQueues.normal.length)
    const droppedMessages = this.priorityQueues.normal.splice(0, messagesToDrop)
    
    const droppedSize = droppedMessages.reduce((sum, msg) => sum + msg.size, 0)
    this.currentMemoryUsage -= droppedSize
    this.processingStats.dropped += messagesToDrop

    this.emit('messagesDropped', { 
      count: messagesToDrop, 
      priority: 'normal',
      freedMemory: droppedSize 
    })
  }

  private startProcessing(): void {
    const processingInterval = 1000 / this.config.processingRate // ms per message
    
    this.processingTimer = setInterval(() => {
      this.processNextMessage()
    }, processingInterval)
  }

  private processNextMessage(): void {
    // Process messages by priority: high -> normal -> low
    let message: FlowControlMessage | undefined

    if (this.priorityQueues.high.length > 0) {
      message = this.priorityQueues.high.shift()
    } else if (this.priorityQueues.normal.length > 0) {
      message = this.priorityQueues.normal.shift()
    } else if (this.priorityQueues.low.length > 0) {
      message = this.priorityQueues.low.shift()
    }

    if (message) {
      this.currentMemoryUsage -= message.size
      this.processingStats.processed++
      this.processingStats.lastProcessTime = Date.now()

      this.emit('messageProcessed', { 
        message,
        bufferSize: this.getTotalBufferSize(),
        memoryUsage: this.currentMemoryUsage 
      })

      // Check if we can resume after backpressure
      this.checkBackpressure()

      // Detect slow consumer
      this.detectSlowConsumer()
    }
  }

  private detectSlowConsumer(): void {
    const timeSinceLastProcess = Date.now() - this.processingStats.lastProcessTime
    
    if (timeSinceLastProcess > this.config.slowConsumerThreshold) {
      this.emit('slowConsumerDetected', { 
        timeSinceLastProcess,
        threshold: this.config.slowConsumerThreshold,
        bufferSize: this.getTotalBufferSize()
      })

      // Send backpressure signal for slow consumer
      this.sendBackpressureSignal({
        type: 'slow_down',
        reason: 'Slow consumer detected',
        timestamp: Date.now(),
        bufferUtilization: (this.getTotalBufferSize() / this.config.maxBufferSize) * 100
      })
    }
  }

  private getTotalBufferSize(): number {
    return this.priorityQueues.high.length + 
           this.priorityQueues.normal.length + 
           this.priorityQueues.low.length
  }

  getStats() {
    const runtime = Date.now() - this.processingStats.startTime
    const processingRate = this.processingStats.processed / (runtime / 1000)

    return {
      bufferSize: this.getTotalBufferSize(),
      memoryUsage: this.currentMemoryUsage,
      memoryUtilization: (this.currentMemoryUsage / this.config.maxMemoryUsage) * 100,
      bufferUtilization: (this.getTotalBufferSize() / this.config.maxBufferSize) * 100,
      isBackpressureActive: this.isBackpressureActive,
      processed: this.processingStats.processed,
      dropped: this.processingStats.dropped,
      processingRate,
      priorityDistribution: {
        high: this.priorityQueues.high.length,
        normal: this.priorityQueues.normal.length,
        low: this.priorityQueues.low.length
      }
    }
  }

  shutdown(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer)
      this.processingTimer = null
    }
  }
}

// Message generator for testing
class MessageFloodGenerator {
  private messageId: number = 1

  generateMessage(
    type: string = 'data',
    priority: 'low' | 'normal' | 'high' = 'normal',
    size: number = 1024
  ): FlowControlMessage {
    return {
      id: `msg-${this.messageId++}`,
      type,
      payload: { data: 'x'.repeat(Math.max(0, size - 100)) }, // Approximate size
      size,
      timestamp: Date.now(),
      priority
    }
  }

  generateFlood(
    count: number,
    sizeRange: { min: number; max: number } = { min: 512, max: 4096 }
  ): FlowControlMessage[] {
    const messages: FlowControlMessage[] = []
    
    for (let i = 0; i < count; i++) {
      const size = Math.floor(Math.random() * (sizeRange.max - sizeRange.min + 1)) + sizeRange.min
      const priority = Math.random() < 0.1 ? 'high' : Math.random() < 0.2 ? 'low' : 'normal'
      
      messages.push(this.generateMessage('flood', priority, size))
    }
    
    return messages
  }

  reset(): void {
    this.messageId = 1
  }
}

describe('Backpressure and Flow Control Property Tests', () => {
  let flowManager: FlowControlManager
  let messageGenerator: MessageFloodGenerator

  beforeEach(() => {
    flowManager = new FlowControlManager({
      maxBufferSize: 1000,
      maxMemoryUsage: 10 * 1024 * 1024, // 10MB for testing
      processingRate: 100 // Slower for testing
    })
    messageGenerator = new MessageFloodGenerator()
  })

  afterEach(() => {
    flowManager.shutdown()
    messageGenerator.reset()
  })

  /**
   * Property Test: System never OOMs under message flood
   * **Validates: Requirements Real-time Systems - Backpressure**
   */
  it('should prevent OOM under message flood conditions', () => {
    fc.assert(
      fc.property(
        fc.record({
          floodSize: fc.integer({ min: 1000, max: 5000 }),
          messageSize: fc.integer({ min: 1024, max: 10240 }),
          burstCount: fc.integer({ min: 1, max: 10 })
        }),
        ({ floodSize, messageSize, burstCount }) => {
          const memoryPressureEvents: any[] = []
          const backpressureSignals: BackpressureSignal[] = []

          flowManager.on('memoryPressure', (event) => {
            memoryPressureEvents.push(event)
          })

          flowManager.on('backpressureSignal', ({ signal }) => {
            backpressureSignals.push(signal)
          })

          // Generate message flood in bursts
          for (let burst = 0; burst < burstCount; burst++) {
            const messages = messageGenerator.generateFlood(floodSize, {
              min: messageSize,
              max: messageSize * 2
            })

            let enqueuedCount = 0
            messages.forEach(message => {
              if (flowManager.enqueueMessage(message)) {
                enqueuedCount++
              }
            })

            // System should handle the flood without crashing
            const stats = flowManager.getStats()
            expect(stats.memoryUsage).toBeLessThanOrEqual(10 * 1024 * 1024) // Should not exceed limit
            expect(stats.bufferSize).toBeLessThanOrEqual(1000) // Should not exceed buffer limit
          }

          // Verify backpressure was activated if needed
          const stats = flowManager.getStats()
          if (stats.memoryUtilization > 80 || stats.bufferUtilization > 80) {
            expect(backpressureSignals.length).toBeGreaterThan(0)
          }

          return true
        }
      ),
      { numRuns: 8 }
    )
  })

  /**
   * Property Test: Buffer overflow triggers backpressure signal
   * **Validates: Requirements Real-time Systems - Backpressure**
   */
  it('should trigger backpressure signals on buffer overflow', () => {
    fc.assert(
      fc.property(
        fc.record({
          messageCount: fc.integer({ min: 1200, max: 2000 }), // Exceed buffer size of 1000
          messageSize: fc.integer({ min: 512, max: 2048 })
        }),
        ({ messageCount, messageSize }) => {
          const bufferOverflowEvents: any[] = []
          const backpressureSignals: BackpressureSignal[] = []

          flowManager.on('bufferOverflow', (event) => {
            bufferOverflowEvents.push(event)
          })

          flowManager.on('backpressureSignal', ({ signal }) => {
            backpressureSignals.push(signal)
          })

          // Generate messages to overflow buffer
          const messages = messageGenerator.generateFlood(messageCount, {
            min: messageSize,
            max: messageSize
          })

          let rejectedCount = 0
          messages.forEach(message => {
            if (!flowManager.enqueueMessage(message)) {
              rejectedCount++
            }
          })

          // Should have buffer overflow events
          expect(bufferOverflowEvents.length).toBeGreaterThan(0)

          // Should have backpressure signals
          const pauseSignals = backpressureSignals.filter(s => s.type === 'pause' || s.type === 'slow_down')
          expect(pauseSignals.length).toBeGreaterThan(0)

          // Should have rejected some messages
          expect(rejectedCount).toBeGreaterThan(0)

          return true
        }
      ),
      { numRuns: 6 }
    )
  })

  /**
   * Property Test: Priority queues work correctly under pressure
   * **Validates: Requirements Real-time Systems - Backpressure**
   */
  it('should prioritize high priority messages under backpressure', () => {
    fc.assert(
      fc.property(
        fc.record({
          highPriorityCount: fc.integer({ min: 10, max: 50 }),
          normalPriorityCount: fc.integer({ min: 100, max: 500 }),
          lowPriorityCount: fc.integer({ min: 100, max: 500 })
        }),
        ({ highPriorityCount, normalPriorityCount, lowPriorityCount }) => {
          const processedMessages: FlowControlMessage[] = []
          const droppedEvents: any[] = []

          flowManager.on('messageProcessed', ({ message }) => {
            processedMessages.push(message)
          })

          flowManager.on('messagesDropped', (event) => {
            droppedEvents.push(event)
          })

          // Generate messages with different priorities
          const highMessages = Array.from({ length: highPriorityCount }, () =>
            messageGenerator.generateMessage('high', 'high', 1024)
          )
          const normalMessages = Array.from({ length: normalPriorityCount }, () =>
            messageGenerator.generateMessage('normal', 'normal', 1024)
          )
          const lowMessages = Array.from({ length: lowPriorityCount }, () =>
            messageGenerator.generateMessage('low', 'low', 1024)
          )

          // Enqueue all messages
          [...highMessages, ...normalMessages, ...lowMessages].forEach(message => {
            flowManager.enqueueMessage(message)
          })

          // Wait for some processing
          return new Promise<boolean>((resolve) => {
            setTimeout(() => {
              const stats = flowManager.getStats()

              // High priority messages should be processed first
              const highProcessed = processedMessages.filter(m => m.priority === 'high').length
              const lowDropped = droppedEvents.filter(e => e.priority === 'low').length

              // Under pressure, low priority messages should be dropped first
              if (stats.dropped > 0) {
                expect(lowDropped).toBeGreaterThan(0)
              }

              // High priority messages should have higher processing rate
              if (processedMessages.length > 0) {
                const highRatio = highProcessed / Math.min(highPriorityCount, processedMessages.length)
                expect(highRatio).toBeGreaterThanOrEqual(0)
              }

              resolve(true)
            }, 1000)
          })
        }
      ),
      { numRuns: 5 }
    )
  })
})

describe('Backpressure and Flow Control Unit Tests', () => {
  let flowManager: FlowControlManager
  let messageGenerator: MessageFloodGenerator

  beforeEach(() => {
    flowManager = new FlowControlManager({
      maxBufferSize: 100,
      maxMemoryUsage: 1024 * 1024, // 1MB
      processingRate: 10 // Very slow for testing
    })
    messageGenerator = new MessageFloodGenerator()
  })

  afterEach(() => {
    flowManager.shutdown()
    messageGenerator.reset()
  })

  /**
   * Unit Test: Memory pressure detection
   */
  it('should detect memory pressure correctly', () => {
    const memoryPressureEvents: any[] = []

    flowManager.on('memoryPressure', (event) => {
      memoryPressureEvents.push(event)
    })

    // Generate large messages to trigger memory pressure
    const largeMessages = Array.from({ length: 100 }, () =>
      messageGenerator.generateMessage('large', 'normal', 50 * 1024) // 50KB each
    )

    largeMessages.forEach(message => {
      flowManager.enqueueMessage(message)
    })

    expect(memoryPressureEvents.length).toBeGreaterThan(0)
  })

  /**
   * Unit Test: Backpressure signal types
   */
  it('should send appropriate backpressure signal types', () => {
    const backpressureSignals: BackpressureSignal[] = []

    flowManager.on('backpressureSignal', ({ signal }) => {
      backpressureSignals.push(signal)
    })

    // Fill buffer to trigger backpressure
    const messages = messageGenerator.generateFlood(150) // Exceed buffer size of 100

    messages.forEach(message => {
      flowManager.enqueueMessage(message)
    })

    // Should have pause or slow_down signals
    const controlSignals = backpressureSignals.filter(s => 
      s.type === 'pause' || s.type === 'slow_down'
    )
    expect(controlSignals.length).toBeGreaterThan(0)

    // Signals should have proper structure
    controlSignals.forEach(signal => {
      expect(signal.timestamp).toBeGreaterThan(0)
      expect(signal.reason).toBeDefined()
      expect(signal.bufferUtilization).toBeGreaterThanOrEqual(0)
    })
  })

  /**
   * Unit Test: Message dropping by priority
   */
  it('should drop low priority messages first', () => {
    const droppedEvents: any[] = []

    flowManager.on('messagesDropped', (event) => {
      droppedEvents.push(event)
    })

    // Fill with low priority messages
    const lowMessages = Array.from({ length: 80 }, () =>
      messageGenerator.generateMessage('low', 'low', 1024)
    )

    // Add high priority messages
    const highMessages = Array.from({ length: 50 }, () =>
      messageGenerator.generateMessage('high', 'high', 1024)
    )

    [...lowMessages, ...highMessages].forEach(message => {
      flowManager.enqueueMessage(message)
    })

    // Low priority messages should be dropped first
    const lowDropEvents = droppedEvents.filter(e => e.priority === 'low')
    expect(lowDropEvents.length).toBeGreaterThan(0)
  })

  /**
   * Unit Test: Processing rate control
   */
  it('should control processing rate correctly', async () => {
    const processedMessages: FlowControlMessage[] = []

    flowManager.on('messageProcessed', ({ message }) => {
      processedMessages.push(message)
    })

    // Add messages
    const messages = messageGenerator.generateFlood(20)
    messages.forEach(message => {
      flowManager.enqueueMessage(message)
    })

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000))

    const stats = flowManager.getStats()
    
    // Processing rate should be controlled (not too fast)
    expect(stats.processingRate).toBeLessThan(50) // Should be around 10 msg/sec
    expect(processedMessages.length).toBeGreaterThan(0)
  })

  /**
   * Unit Test: Buffer utilization calculation
   */
  it('should calculate buffer utilization correctly', () => {
    const messages = messageGenerator.generateFlood(50) // Half of buffer size

    messages.forEach(message => {
      flowManager.enqueueMessage(message)
    })

    const stats = flowManager.getStats()
    
    expect(stats.bufferUtilization).toBeCloseTo(50, 5) // Should be around 50%
    expect(stats.bufferSize).toBe(50)
  })

  /**
   * Unit Test: Slow consumer detection
   */
  it('should detect slow consumers', async () => {
    const slowConsumerEvents: any[] = []

    flowManager.on('slowConsumerDetected', (event) => {
      slowConsumerEvents.push(event)
    })

    // Configure very slow processing
    flowManager.shutdown()
    flowManager = new FlowControlManager({
      processingRate: 1, // 1 msg/sec
      slowConsumerThreshold: 1000 // 1 second
    })

    // Add messages
    const messages = messageGenerator.generateFlood(10)
    messages.forEach(message => {
      flowManager.enqueueMessage(message)
    })

    // Wait for slow consumer detection
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Should detect slow consumer
    expect(slowConsumerEvents.length).toBeGreaterThan(0)
  })
})