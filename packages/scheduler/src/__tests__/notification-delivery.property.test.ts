/**
 * Property tests for notification delivery
 * **Property 17: Notification Delivery**
 * **Validates: Requirements 8.3, 8.4**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { NotificationService } from '../notification-service';
import { NotificationConfig, ScheduleExecution, NotificationChannel } from '../types';

// Mock axios completely
const mockAxiosPost = vi.fn();
const mockAxios = vi.fn();

vi.mock('axios', () => ({
  default: mockAxios,
  post: mockAxiosPost,
}));

describe('Property 17: Notification Delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ data: 'success' });
    mockAxios.mockResolvedValue({ data: 'success' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should deliver notifications for all completed tests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channels: fc.array(
            fc.record({
              type: fc.constantFrom('slack', 'discord', 'webhook'),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              config: fc.record({
                webhookUrl: fc.webUrl(),
                method: fc.constantFrom('POST', 'PUT'),
              }),
              events: fc.constantFrom(['schedule-completed'], ['schedule-failed'], ['schedule-completed', 'schedule-failed']),
            }),
            { minLength: 1, maxLength: 2 }
          ),
          execution: fc.record({
            id: fc.uuid(),
            scheduleId: fc.uuid(),
            executionId: fc.uuid(),
            status: fc.constantFrom('completed', 'failed'),
            startTime: fc.date(),
            endTime: fc.date(),
            duration: fc.integer({ min: 1000, max: 300000 }),
          }),
        }),
        async (data) => {
          // Clear mocks before each property test run
          mockAxiosPost.mockClear();
          mockAxios.mockClear();
          
          const config: NotificationConfig = {
            enabled: true,
            channels: data.channels as NotificationChannel[],
            templates: {
              scheduleStarted: 'Schedule started',
              scheduleCompleted: 'Schedule completed',
              scheduleFailed: 'Schedule failed',
              criticalFailure: 'Critical failure',
            },
          };

          const notificationService = new NotificationService(config);
          const execution = data.execution as ScheduleExecution;

          // Property: Notifications should be sent for all relevant channels
          if (execution.status === 'completed') {
            await notificationService.notifyScheduleCompleted(execution);
            
            const relevantChannels = data.channels.filter(c => 
              c.events.includes('schedule-completed')
            );
            
            const totalCalls = mockAxiosPost.mock.calls.length + mockAxios.mock.calls.length;
            expect(totalCalls).toBe(relevantChannels.length);
          } else if (execution.status === 'failed') {
            await notificationService.notifyScheduleFailed(execution);
            
            const relevantChannels = data.channels.filter(c => 
              c.events.includes('schedule-failed')
            );
            
            const totalCalls = mockAxiosPost.mock.calls.length + mockAxios.mock.calls.length;
            expect(totalCalls).toBe(relevantChannels.length);
          }

          // Property: All notification calls should include execution details
          const calls = mockAxiosPost.mock.calls.concat(mockAxios.mock.calls);
          for (const call of calls) {
            const [url, payload] = call;
            expect(url).toBeDefined();
            expect(payload).toBeDefined();
            
            // Check that payload contains execution information
            const payloadStr = JSON.stringify(payload);
            expect(payloadStr).toContain(execution.id);
          }
        }
      ),
      { numRuns: 3 } // Reduce number of runs for faster execution
    );
  });

  it('should format notification content consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          execution: fc.record({
            id: fc.uuid(),
            scheduleId: fc.uuid(),
            executionId: fc.uuid(),
            status: fc.constantFrom('completed', 'failed'),
            startTime: fc.date(),
            duration: fc.integer({ min: 1000, max: 300000 }),
          }),
          channelType: fc.constantFrom('slack', 'discord'),
        }),
        async (data) => {
          // Clear mocks before each property test run
          mockAxiosPost.mockClear();
          mockAxios.mockClear();
          
          const config: NotificationConfig = {
            enabled: true,
            channels: [{
              type: data.channelType as any,
              name: 'test-channel',
              config: {
                webhookUrl: 'https://hooks.slack.com/test',
              },
              events: ['schedule-completed', 'schedule-failed'],
            }],
            templates: {
              scheduleStarted: 'Schedule started',
              scheduleCompleted: 'Schedule completed',
              scheduleFailed: 'Schedule failed',
              criticalFailure: 'Critical failure',
            },
          };

          const notificationService = new NotificationService(config);
          const execution = data.execution as ScheduleExecution;

          // Send notification
          if (execution.status === 'completed') {
            await notificationService.notifyScheduleCompleted(execution);
          } else {
            await notificationService.notifyScheduleFailed(execution);
          }

          // Property: Notification content should include relevant execution details
          const totalCalls = mockAxiosPost.mock.calls.length + mockAxios.mock.calls.length;
          expect(totalCalls).toBe(1);
          
          const call = mockAxiosPost.mock.calls[0] || mockAxios.mock.calls[0];
          const [, payload] = call;
          
          const messageContent = data.channelType === 'slack' ? payload.text : payload.content;
          expect(messageContent).toContain(execution.scheduleId);
          expect(messageContent).toContain(execution.id);
          expect(messageContent).toContain(execution.status);
          
          // Property: Duration should be formatted consistently
          if (execution.duration) {
            const expectedDuration = `${Math.round(execution.duration / 1000)}s`;
            expect(messageContent).toContain(expectedDuration);
          }
        }
      ),
      { numRuns: 3 } // Reduce number of runs for faster execution
    );
  });
});