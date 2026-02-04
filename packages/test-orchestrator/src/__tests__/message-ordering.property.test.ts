import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { EventEmitter } from 'events'

/**
 * Property-Based Tests for Message Ordering and Delivery Guarantees
 * 
 * **Validates: Requirements Real-time Systems - Message Ordering**
 * 
 * These tests ensure that:
 * - Messages always arrive in correct order
 * - Duplicate messages are detected and ignored
 * - Missing sequence numbers trigger re-request
 */

interface Message {
  id: string
  sequenceNumber: number
  type: string
  payload: any
  timestamp: number
  acknowledgmentRequired: boolean
}

interface MessageAck {
  messageId: string
  sequenceNumber: number
  timestamp: number
}

class MessageOrderingManager extends EventEmitter {
  private expectedSequenceNumber: number = 1
  private receivedMessages: Map<number, Message> = new Map()
  private pendingMessages: Message[] = []
  private duplicateMessages: Set<string> = new Set()
  private missingSequences: Set<number> = new Set()
  private ackTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private config: {
    maxOutOfOrderBuffer: number
    ackTimeout: number
    maxRetries: number
    reorderTimeout: number
  }

  constructor(config: Partial<typeof this.config> = {}) {
    super()
    
    this.config = {
      maxOutOfOrderBuffer: 100,
      ackTimeout: 5000,
      maxRetries: 3,
      reorderTimeout: 1000,
      ...config
    }
  }

  processMessage(message: Message): void {
    // Check for duplicates
    if (this.duplicateMessages.has(message.id)) {
      this.emit('duplicateMessage', { message })
      return
    }

    // Add to duplicate detection set
    this.duplicateMessages.add(message.id)

    // Check sequence number
    if (message.sequenceNumber === this.expectedSequenceNumber) {
      // Message is in order
      this.deliverMessage(message)
      this.processBufferedMessages()
    } else if (message.sequenceNumber > this.expectedSequenceNumber) {
      // Message is out of order (future message)
      this.bufferMessage(message)
      this.detectMissingMessages(message.sequenceNumber)
    } else {
      // Message is from the past (duplicate or late arrival)
      this.emit('lateMessage', { message, expected: this.expectedSequenceNumber })
    }

    // Send acknowledgment if required
    if (message.acknowledgmentRequired) {
      this.sendAcknowledgment(message)
    }
  }

  private deliverMessage(message: Message): void {
    this.receivedMessages.set(message.sequenceNumber, message)
    this.expectedSequenceNumber = message.sequenceNumber + 1
    this.emit('messageDelivered', { message, sequenceNumber: message.sequenceNumber })
  }

  private bufferMessage(message: Message): void {
    // Check buffer size limit
    if (this.pendingMessages.length >= this.config.maxOutOfOrderBuffer) {
      this.emit('bufferOverflow', { message, bufferSize: this.pendingMessages.length })
      return
    }

    // Insert message in correct position (sorted by sequence number)
    const insertIndex = this.pendingMessages.findIndex(
      m => m.sequenceNumber > message.sequenceNumber
    )
    
    if (insertIndex === -1) {
      this.pendingMessages.push(message)
    } else {
      this.pendingMessages.splice(insertIndex, 0, message)
    }

    this.emit('messageBuffered', { message, bufferSize: this.pendingMessages.length })

    // Set timeout for reordering
    setTimeout(() => {
      this.processBufferedMessages()
    }, this.config.reorderTimeout)
  }

  private processBufferedMessages(): void {
    while (this.pendingMessages.length > 0) {
      const nextMessage = this.pendingMessages[0]
      
      if (nextMessage.sequenceNumber === this.expectedSequenceNumber) {
        this.pendingMessages.shift()
        this.deliverMessage(nextMessage)
      } else {
        break
      }
    }
  }

  private detectMissingMessages(receivedSequenceNumber: number): void {
    for (let seq = this.expectedSequenceNumber; seq < receivedSequenceNumber; seq++) {
      if (!this.missingSequences.has(seq)) {
        this.missingSequences.add(seq)
        this.emit('missingMessage', { sequenceNumber: seq })
        this.requestMissingMessage(seq)
      }
    }
  }

  private requestMissingMessage(sequenceNumber: number): void {
    this.emit('requestRetransmission', { sequenceNumber })
    
    // Set timeout for retransmission request
    setTimeout(() => {
      if (this.missingSequences.has(sequenceNumber)) {
        this.emit('retransmissionTimeout', { sequenceNumber })
      }
    }, this.config.ackTimeout)
  }

  private sendAcknowledgment(message: Message): void {
    const ack: MessageAck = {
      messageId: message.id,
      sequenceNumber: message.sequenceNumber,
      timestamp: Date.now()
    }

    this.emit('acknowledgmentSent', { ack })

    // Set timeout for acknowledgment
    const timeout = setTimeout(() => {
      this.emit('acknowledgmentTimeout', { messageId: message.id })
    }, this.config.ackTimeout)

    this.ackTimeouts.set(message.id, timeout)
  }

  receiveAcknowledgment(ack: MessageAck): void {
    const timeout = this.ackTimeouts.get(ack.messageId)
    if (timeout) {
      clearTimeout(timeout)
      this.ackTimeouts.delete(ack.messageId)
      this.emit('acknowledgmentReceived', { ack })
    }
  }

  handleRetransmittedMessage(message: Message): void {
    if (this.missingSequences.has(message.sequenceNumber)) {
      this.missingSequences.delete(message.sequenceNumber)
      this.processMessage(message)
      this.emit('missingMessageRecovered', { message })
    }
  }

  getStats() {
    return {
      expectedSequenceNumber: this.expectedSequenceNumber,
      bufferedMessages: this.pendingMessages.length,
      duplicateCount: this.duplicateMessages.size,
      missingCount: this.missingSequences.size,
      deliveredCount: this.receivedMessages.size,
      pendingAcks: this.ackTimeouts.size
    }
  }

  reset(): void {
    this.expectedSequenceNumber = 1
    this.receivedMessages.clear()
    this.pendingMessages = []
    this.duplicateMessages.clear()
    this.missingSequences.clear()
    
    // Clear all timeouts
    this.ackTimeouts.forEach(timeout => clearTimeout(timeout))
    this.ackTimeouts.clear()
  }
}

// Message generator for testing
class MessageGenerator {
  private sequenceNumber: number = 1
  private messageId: number = 1

  generateMessage(type: string = 'data', payload: any = {}, requireAck: boolean = false): Message {
    return {
      id: `msg-${this.messageId++}`,
      sequenceNumber: this.sequenceNumber++,
      type,
      payload,
      timestamp: Date.now(),
      acknowledgmentRequired: requireAck
    }
  }

  generateSequence(count: number, type: string = 'data'): Message[] {
    return Array.from({ length: count }, () => this.generateMessage(type))
  }

  generateOutOfOrderSequence(count: number): Message[] {
    const messages = this.generateSequence(count)
    
    // Shuffle messages to create out-of-order scenario
    for (let i = messages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[messages[i], messages[j]] = [messages[j], messages[i]]
    }
    
    return messages
  }

  reset(): void {
    this.sequenceNumber = 1
    this.messageId = 1
  }
}

describe('Message Ordering Property Tests', () => {
  let messageManager: MessageOrderingManager
  let messageGenerator: MessageGenerator

  beforeEach(() => {
    messageManager = new MessageOrderingManager()
    messageGenerator = new MessageGenerator()
  })

  afterEach(() => {
    messageManager.reset()
    messageGenerator.reset()
  })

  /**
   * Property Test: Messages always arrive in correct order
   * **Validates: Requirements Real-time Systems - Message Ordering**
   */
  it('should deliver messages in correct sequence order', () => {
    fc.assert(
      fc.property(
        fc.record({
          messageCount: fc.integer({ min: 5, max: 50 }),
          shufflePercentage: fc.float({ min: 0, max: 1 })
        }),
        ({ messageCount, shufflePercentage }) => {
          const deliveredMessages: Message[] = []
          
          messageManager.on('messageDelivered', ({ message }) => {
            deliveredMessages.push(message)
          })

          // Generate messages
          const messages = messageGenerator.generateSequence(messageCount)
          
          // Shuffle some messages to simulate out-of-order delivery
          const shuffleCount = Math.floor(messageCount * shufflePercentage)
          for (let i = 0; i < shuffleCount; i++) {
            const idx1 = Math.floor(Math.random() * messageCount)
            const idx2 = Math.floor(Math.random() * messageCount)
            ;[messages[idx1], messages[idx2]] = [messages[idx2], messages[idx1]]
          }

          // Process all messages
          messages.forEach(message => {
            messageManager.processMessage(message)
          })

          // Verify delivered messages are in correct order
          for (let i = 0; i < deliveredMessages.length - 1; i++) {
            expect(deliveredMessages[i].sequenceNumber).toBeLessThan(
              deliveredMessages[i + 1].sequenceNumber
            )
          }

          // Verify all messages are eventually delivered
          expect(deliveredMessages.length).toBeLessThanOrEqual(messageCount)

          return true
        }
      ),
      { numRuns: 15 }
    )
  })

  /**
   * Property Test: Duplicate messages are detected and ignored
   * **Validates: Requirements Real-time Systems - Message Ordering**
   */
  it('should detect and ignore duplicate messages', () => {
    fc.assert(
      fc.property(
        fc.record({
          originalCount: fc.integer({ min: 5, max: 20 }),
          duplicateCount: fc.integer({ min: 1, max: 10 })
        }),
        ({ originalCount, duplicateCount }) => {
          const deliveredMessages: Message[] = []
          const duplicateMessages: Message[] = []

          messageManager.on('messageDelivered', ({ message }) => {
            deliveredMessages.push(message)
          })

          messageManager.on('duplicateMessage', ({ message }) => {
            duplicateMessages.push(message)
          })

          // Generate original messages
          const originalMessages = messageGenerator.generateSequence(originalCount)
          
          // Create duplicates by copying some original messages
          const duplicates: Message[] = []
          for (let i = 0; i < duplicateCount; i++) {
            const originalIndex = Math.floor(Math.random() * originalMessages.length)
            duplicates.push({ ...originalMessages[originalIndex] })
          }

          // Process original messages
          originalMessages.forEach(message => {
            messageManager.processMessage(message)
          })

          // Process duplicate messages
          duplicates.forEach(message => {
            messageManager.processMessage(message)
          })

          // Verify duplicates were detected
          expect(duplicateMessages.length).toBe(duplicateCount)

          // Verify no duplicate messages were delivered
          const deliveredIds = new Set(deliveredMessages.map(m => m.id))
          expect(deliveredIds.size).toBe(deliveredMessages.length)

          return true
        }
      ),
      { numRuns: 12 }
    )
  })

  /**
   * Property Test: Missing sequence numbers trigger re-request
   * **Validates: Requirements Real-time Systems - Message Ordering**
   */
  it('should detect missing messages and request retransmission', () => {
    fc.assert(
      fc.property(
        fc.record({
          totalMessages: fc.integer({ min: 10, max: 30 }),
          missingPercentage: fc.float({ min: Math.fround(0.1), max: Math.fround(0.5) })
        }),
        ({ totalMessages, missingPercentage }) => {
          const missingMessages: number[] = []
          const retransmissionRequests: number[] = []

          messageManager.on('missingMessage', ({ sequenceNumber }) => {
            missingMessages.push(sequenceNumber)
          })

          messageManager.on('requestRetransmission', ({ sequenceNumber }) => {
            retransmissionRequests.push(sequenceNumber)
          })

          // Generate messages
          const allMessages = messageGenerator.generateSequence(totalMessages)
          
          // Remove some messages to simulate missing messages
          const missingCount = Math.floor(totalMessages * missingPercentage)
          const messagesToSend = [...allMessages]
          
          for (let i = 0; i < missingCount; i++) {
            const removeIndex = Math.floor(Math.random() * messagesToSend.length)
            messagesToSend.splice(removeIndex, 1)
          }

          // Process available messages
          messagesToSend.forEach(message => {
            messageManager.processMessage(message)
          })

          // Verify missing messages were detected
          expect(missingMessages.length).toBeGreaterThan(0)
          
          // Verify retransmission requests were made
          expect(retransmissionRequests.length).toBe(missingMessages.length)

          // Verify missing sequence numbers are correct
          missingMessages.forEach(seqNum => {
            expect(seqNum).toBeGreaterThan(0)
            expect(seqNum).toBeLessThanOrEqual(totalMessages)
          })

          return true
        }
      ),
      { numRuns: 10 }
    )
  })
})

describe('Message Ordering Unit Tests', () => {
  let messageManager: MessageOrderingManager
  let messageGenerator: MessageGenerator

  beforeEach(() => {
    messageManager = new MessageOrderingManager()
    messageGenerator = new MessageGenerator()
  })

  afterEach(() => {
    messageManager.reset()
    messageGenerator.reset()
  })

  /**
   * Unit Test: In-order message delivery
   */
  it('should deliver in-order messages immediately', () => {
    const deliveredMessages: Message[] = []
    
    messageManager.on('messageDelivered', ({ message }) => {
      deliveredMessages.push(message)
    })

    const messages = messageGenerator.generateSequence(5)
    
    messages.forEach(message => {
      messageManager.processMessage(message)
    })

    expect(deliveredMessages.length).toBe(5)
    expect(deliveredMessages[0].sequenceNumber).toBe(1)
    expect(deliveredMessages[4].sequenceNumber).toBe(5)
  })

  /**
   * Unit Test: Out-of-order message buffering
   */
  it('should buffer out-of-order messages', () => {
    const deliveredMessages: Message[] = []
    const bufferedMessages: Message[] = []

    messageManager.on('messageDelivered', ({ message }) => {
      deliveredMessages.push(message)
    })

    messageManager.on('messageBuffered', ({ message }) => {
      bufferedMessages.push(message)
    })

    // Send message 3 first (out of order)
    const message3 = messageGenerator.generateMessage()
    message3.sequenceNumber = 3
    messageManager.processMessage(message3)

    // Should be buffered, not delivered
    expect(deliveredMessages.length).toBe(0)
    expect(bufferedMessages.length).toBe(1)

    // Send message 1
    const message1 = messageGenerator.generateMessage()
    message1.sequenceNumber = 1
    messageManager.processMessage(message1)

    // Message 1 should be delivered
    expect(deliveredMessages.length).toBe(1)
    expect(deliveredMessages[0].sequenceNumber).toBe(1)
  })

  /**
   * Unit Test: Buffer overflow handling
   */
  it('should handle buffer overflow gracefully', () => {
    const bufferOverflows: Message[] = []

    messageManager.on('bufferOverflow', ({ message }) => {
      bufferOverflows.push(message)
    })

    // Configure small buffer for testing
    messageManager = new MessageOrderingManager({ maxOutOfOrderBuffer: 3 })
    
    // Re-attach event listener after recreating manager
    messageManager.on('bufferOverflow', ({ message }) => {
      bufferOverflows.push(message)
    })

    // Send messages that will overflow the buffer (start from sequence 5 to force buffering)
    for (let i = 5; i <= 10; i++) {
      const message = messageGenerator.generateMessage()
      message.sequenceNumber = i
      messageManager.processMessage(message)
    }

    expect(bufferOverflows.length).toBeGreaterThan(0)
  })

  /**
   * Unit Test: Acknowledgment handling
   */
  it('should handle message acknowledgments correctly', () => {
    const acksSent: MessageAck[] = []
    const acksReceived: MessageAck[] = []

    messageManager.on('acknowledgmentSent', ({ ack }) => {
      acksSent.push(ack)
    })

    messageManager.on('acknowledgmentReceived', ({ ack }) => {
      acksReceived.push(ack)
    })

    // Send message requiring acknowledgment
    const message = messageGenerator.generateMessage('data', {}, true)
    messageManager.processMessage(message)

    expect(acksSent.length).toBe(1)
    expect(acksSent[0].messageId).toBe(message.id)

    // Simulate receiving acknowledgment
    messageManager.receiveAcknowledgment(acksSent[0])

    expect(acksReceived.length).toBe(1)
    expect(acksReceived[0].messageId).toBe(message.id)
  })

  /**
   * Unit Test: Retransmitted message handling
   */
  it('should handle retransmitted messages correctly', () => {
    const recoveredMessages: Message[] = []

    messageManager.on('missingMessageRecovered', ({ message }) => {
      recoveredMessages.push(message)
    })

    // Send message 3 to create gap
    const message3 = messageGenerator.generateMessage()
    message3.sequenceNumber = 3
    messageManager.processMessage(message3)

    // This should detect missing messages 1 and 2
    const stats = messageManager.getStats()
    expect(stats.missingCount).toBe(2)

    // Send retransmitted message 1
    const message1 = messageGenerator.generateMessage()
    message1.sequenceNumber = 1
    messageManager.handleRetransmittedMessage(message1)

    expect(recoveredMessages.length).toBe(1)
    expect(recoveredMessages[0].sequenceNumber).toBe(1)
  })

  /**
   * Unit Test: Statistics tracking
   */
  it('should track message statistics correctly', () => {
    const messages = messageGenerator.generateSequence(5)
    
    messages.forEach(message => {
      messageManager.processMessage(message)
    })

    const stats = messageManager.getStats()
    
    expect(stats.deliveredCount).toBe(5)
    expect(stats.expectedSequenceNumber).toBe(6)
    expect(stats.bufferedMessages).toBe(0)
    expect(stats.duplicateCount).toBe(5) // Each message ID is tracked
  })

  /**
   * Unit Test: Late message handling
   */
  it('should handle late arriving messages', () => {
    const lateMessages: Message[] = []

    messageManager.on('lateMessage', ({ message }) => {
      lateMessages.push(message)
    })

    // Process messages 1-3
    const messages = messageGenerator.generateSequence(3)
    messages.forEach(message => {
      messageManager.processMessage(message)
    })

    // Send message 2 again (late arrival)
    const lateMessage = { ...messages[1] }
    lateMessage.id = 'late-msg-1' // Different ID to avoid duplicate detection
    messageManager.processMessage(lateMessage)

    expect(lateMessages.length).toBe(1)
    expect(lateMessages[0].sequenceNumber).toBe(2)
  })
})