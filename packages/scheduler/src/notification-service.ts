/**
 * Notification Service for Scheduled Tests
 * **Validates: Requirements 8.3, 8.4**
 */

import axios from 'axios';
import { NotificationConfig, NotificationChannel, ScheduleExecution } from './types';
import { logger } from './utils/logger';

export class NotificationService {
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Send notification for schedule completion
   */
  async notifyScheduleCompleted(execution: ScheduleExecution): Promise<void> {
    if (!this.config.enabled) return;

    const channels = this.config.channels.filter(c => 
      c.events.includes('schedule-completed')
    );

    await Promise.all(channels.map(channel => 
      this.sendNotification(channel, 'schedule-completed', execution)
    ));
  }

  /**
   * Send notification for schedule failure
   */
  async notifyScheduleFailed(execution: ScheduleExecution): Promise<void> {
    if (!this.config.enabled) return;

    const channels = this.config.channels.filter(c => 
      c.events.includes('schedule-failed')
    );

    await Promise.all(channels.map(channel => 
      this.sendNotification(channel, 'schedule-failed', execution)
    ));
  }

  /**
   * Send notification to a specific channel
   */
  private async sendNotification(
    channel: NotificationChannel,
    event: string,
    execution: ScheduleExecution
  ): Promise<void> {
    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackNotification(channel, event, execution);
          break;
        case 'discord':
          await this.sendDiscordNotification(channel, event, execution);
          break;
        case 'email':
          await this.sendEmailNotification(channel, event, execution);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, event, execution);
          break;
      }
    } catch (error) {
      logger.error('Failed to send notification', {
        channel: channel.name,
        event,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    channel: NotificationChannel,
    event: string,
    execution: ScheduleExecution
  ): Promise<void> {
    const config = channel.config as any;
    const message = this.formatMessage(event, execution);

    await axios.post(config.webhookUrl, {
      text: message,
      channel: config.channel,
      username: config.username || 'AutoQA Bot',
      icon_emoji: config.iconEmoji || ':robot_face:',
    });
  }

  /**
   * Send Discord notification
   */
  private async sendDiscordNotification(
    channel: NotificationChannel,
    event: string,
    execution: ScheduleExecution
  ): Promise<void> {
    const config = channel.config as any;
    const message = this.formatMessage(event, execution);

    await axios.post(config.webhookUrl, {
      content: message,
      username: config.username || 'AutoQA Bot',
      avatar_url: config.avatarUrl,
    });
  }

  /**
   * Send email notification (placeholder)
   */
  private async sendEmailNotification(
    channel: NotificationChannel,
    event: string,
    execution: ScheduleExecution
  ): Promise<void> {
    // Email implementation would go here
    logger.info('Email notification sent', { event, executionId: execution.id });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    channel: NotificationChannel,
    event: string,
    execution: ScheduleExecution
  ): Promise<void> {
    const config = channel.config as any;
    
    await axios({
      method: config.method || 'POST',
      url: config.url,
      headers: config.headers || {},
      data: {
        event,
        execution,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Format notification message
   */
  private formatMessage(event: string, execution: ScheduleExecution): string {
    const status = execution.status === 'completed' ? '✅' : '❌';
    const duration = execution.duration ? `${Math.round(execution.duration / 1000)}s` : 'N/A';
    
    return `${status} Scheduled test ${execution.status}\n` +
           `Execution ID: ${execution.id}\n` +
           `Schedule ID: ${execution.scheduleId}\n` +
           `Duration: ${duration}\n` +
           `Time: ${execution.startTime.toISOString()}`;
  }
}