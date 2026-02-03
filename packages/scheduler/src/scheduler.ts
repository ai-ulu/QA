/**
 * Cron-based Test Scheduler
 * **Validates: Requirements 8.1, 8.2, 8.5**
 */

import * as cron from 'node-cron';
import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { ScheduleConfig, ScheduleExecution, SchedulerConfig } from './types';
import { CronValidator } from './cron-validator';
import { logger } from './utils/logger';

export class TestScheduler {
  private schedules: Map<string, ScheduleConfig> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private executionQueue: Bull.Queue;
  private config: SchedulerConfig;

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.executionQueue = new Bull('scheduled-tests', config.redisUrl);
    this.setupQueueProcessor();
  }

  /**
   * Create a new schedule
   */
  async createSchedule(schedule: Omit<ScheduleConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const validation = CronValidator.validate(schedule.cronExpression, schedule.timezone);
    if (!validation.isValid) {
      logger.warn('Cron validation failed', {
        cronExpression: schedule.cronExpression,
        error: validation.error,
      });
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    const scheduleConfig: ScheduleConfig = {
      ...schedule,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
      nextExecutionAt: CronValidator.getNextExecution(schedule.cronExpression, schedule.timezone),
    };

    this.schedules.set(scheduleConfig.id, scheduleConfig);

    if (scheduleConfig.isActive) {
      this.startSchedule(scheduleConfig.id);
    }

    logger.info('Schedule created', { scheduleId: scheduleConfig.id, name: scheduleConfig.name });
    return scheduleConfig.id;
  }

  /**
   * Start a schedule
   */
  private startSchedule(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return;

    try {
      const task = cron.schedule(schedule.cronExpression, async () => {
        await this.executeSchedule(scheduleId);
      }, {
        scheduled: false,
        timezone: schedule.timezone,
      });

      task.start();
      this.cronJobs.set(scheduleId, task);
      logger.info('Schedule started', { scheduleId, name: schedule.name });
    } catch (error) {
      logger.error('Failed to start schedule', {
        scheduleId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Execute a scheduled test
   */
  private async executeSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.isActive) return;

    const executionId = uuidv4();
    const execution: ScheduleExecution = {
      id: executionId,
      scheduleId,
      executionId,
      status: 'pending',
      startTime: new Date(),
    };

    try {
      // Queue test execution
      await this.executionQueue.add('execute-scheduled-test', {
        scheduleId,
        executionId,
        projectId: schedule.projectId,
        scenarioIds: schedule.scenarioIds,
        userId: schedule.userId,
      });

      // Update schedule
      schedule.lastExecutedAt = new Date();
      schedule.nextExecutionAt = CronValidator.getNextExecution(
        schedule.cronExpression, 
        schedule.timezone
      );

      logger.info('Scheduled test queued', { scheduleId, executionId });
    } catch (error) {
      logger.error('Failed to queue scheduled test', {
        scheduleId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Setup queue processor
   */
  private setupQueueProcessor(): void {
    this.executionQueue.process('execute-scheduled-test', async (job) => {
      const { scheduleId, executionId, projectId, scenarioIds } = job.data;
      
      // Here we would integrate with the test orchestrator
      // For now, simulate execution
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info('Scheduled test completed', { scheduleId, executionId });
      return { success: true };
    });
  }

  /**
   * Get all schedules
   */
  getSchedules(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;

    // Stop cron job
    const cronJob = this.cronJobs.get(scheduleId);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(scheduleId);
    }

    this.schedules.delete(scheduleId);
    logger.info('Schedule deleted', { scheduleId });
    return true;
  }
}