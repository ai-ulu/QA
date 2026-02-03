/**
 * Cron Expression Validator and Parser
 * **Validates: Requirements 8.1, 8.2, 8.5**
 * 
 * Provides comprehensive cron expression validation with:
 * - Syntax validation and parsing
 * - Timezone handling and DST support
 * - Next execution calculation
 * - Human-readable descriptions
 */

import * as cronParser from 'cron-parser';
import moment from 'moment-timezone';
import { CronValidationResult } from './types';
import { logger } from './utils/logger';

export class CronValidator {
  private static readonly CRON_PATTERNS = {
    // Standard 5-field cron (minute hour day month weekday)
    STANDARD: /^(\*|[0-5]?\d|\*\/\d+|[0-5]?\d-[0-5]?\d|[0-5]?\d(?:,[0-5]?\d)*)\s+(\*|[01]?\d|2[0-3]|\*\/\d+|[01]?\d-2[0-3]|[01]?\d(?:,[01]?\d)*)\s+(\*|[12]?\d|3[01]|\*\/\d+|[12]?\d-3[01]|[12]?\d(?:,[12]?\d)*)\s+(\*|[1-9]|1[0-2]|\*\/\d+|[1-9]-1[0-2]|[1-9](?:,[1-9])*)\s+(\*|[0-6]|\*\/\d+|[0-6]-[0-6]|[0-6](?:,[0-6])*)$/,
    
    // 6-field cron with seconds (second minute hour day month weekday)
    WITH_SECONDS: /^(\*|[0-5]?\d|\*\/\d+|[0-5]?\d-[0-5]?\d|[0-5]?\d(?:,[0-5]?\d)*)\s+(\*|[0-5]?\d|\*\/\d+|[0-5]?\d-[0-5]?\d|[0-5]?\d(?:,[0-5]?\d)*)\s+(\*|[01]?\d|2[0-3]|\*\/\d+|[01]?\d-2[0-3]|[01]?\d(?:,[01]?\d)*)\s+(\*|[12]?\d|3[01]|\*\/\d+|[12]?\d-3[01]|[12]?\d(?:,[12]?\d)*)\s+(\*|[1-9]|1[0-2]|\*\/\d+|[1-9]-1[0-2]|[1-9](?:,[1-9])*)\s+(\*|[0-6]|\*\/\d+|[0-6]-[0-6]|[0-6](?:,[0-6])*)$/
  };

  private static readonly PREDEFINED_SCHEDULES = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  /**
   * Validate a cron expression
   */
  static validate(
    cronExpression: string, 
    timezone: string = 'UTC',
    options: {
      maxNextExecutions?: number;
      validateFuture?: boolean;
    } = {}
  ): CronValidationResult {
    try {
      // Check for empty or whitespace-only expressions
      if (!cronExpression || cronExpression.trim().length === 0) {
        return {
          isValid: false,
          error: 'Cron expression cannot be empty',
        };
      }

      // Normalize expression
      const normalizedExpression = this.normalizeCronExpression(cronExpression);
      
      // Validate timezone
      if (!moment.tz.zone(timezone)) {
        return {
          isValid: false,
          error: `Invalid timezone: ${timezone}`,
        };
      }

      // Parse cron expression
      const interval = cronParser.parseExpression(normalizedExpression, {
        tz: timezone,
        currentDate: new Date(),
      });

      // Calculate next executions
      const nextExecutions: Date[] = [];
      const maxExecutions = options.maxNextExecutions || 5;
      
      for (let i = 0; i < maxExecutions; i++) {
        try {
          const next = interval.next();
          nextExecutions.push(next.toDate());
        } catch (error) {
          break;
        }
      }

      // Validate that we have future executions
      if (options.validateFuture && nextExecutions.length === 0) {
        return {
          isValid: false,
          error: 'Cron expression does not produce any future executions',
        };
      }

      // Generate human-readable description
      const description = this.generateDescription(normalizedExpression);

      return {
        isValid: true,
        nextExecutions,
        description,
      };

    } catch (error) {
      logger.warn('Cron validation failed', {
        cronExpression,
        timezone,
        error: (error as Error).message,
      });

      return {
        isValid: false,
        error: `Invalid cron expression: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get next execution time for a cron expression
   */
  static getNextExecution(
    cronExpression: string,
    timezone: string = 'UTC',
    fromDate?: Date
  ): Date | null {
    try {
      const normalizedExpression = this.normalizeCronExpression(cronExpression);
      
      const interval = cronParser.parseExpression(normalizedExpression, {
        tz: timezone,
        currentDate: fromDate || new Date(),
      });

      return interval.next().toDate();
    } catch (error) {
      logger.error('Failed to get next execution', {
        cronExpression,
        timezone,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get multiple next execution times
   */
  static getNextExecutions(
    cronExpression: string,
    count: number,
    timezone: string = 'UTC',
    fromDate?: Date
  ): Date[] {
    try {
      const normalizedExpression = this.normalizeCronExpression(cronExpression);
      
      const interval = cronParser.parseExpression(normalizedExpression, {
        tz: timezone,
        currentDate: fromDate || new Date(),
      });

      const executions: Date[] = [];
      for (let i = 0; i < count; i++) {
        try {
          const next = interval.next();
          executions.push(next.toDate());
        } catch (error) {
          break;
        }
      }

      return executions;
    } catch (error) {
      logger.error('Failed to get next executions', {
        cronExpression,
        count,
        timezone,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Check if a cron expression will execute within a time range
   */
  static willExecuteInRange(
    cronExpression: string,
    startDate: Date,
    endDate: Date,
    timezone: string = 'UTC'
  ): boolean {
    try {
      const normalizedExpression = this.normalizeCronExpression(cronExpression);
      
      const interval = cronParser.parseExpression(normalizedExpression, {
        tz: timezone,
        currentDate: startDate,
      });

      while (true) {
        try {
          const next = interval.next();
          const nextDate = next.toDate();
          
          if (nextDate > endDate) {
            return false;
          }
          
          if (nextDate >= startDate && nextDate <= endDate) {
            return true;
          }
        } catch (error) {
          return false;
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Normalize cron expression (handle predefined schedules)
   */
  private static normalizeCronExpression(expression: string): string {
    const trimmed = expression.trim().toLowerCase();
    
    // Handle predefined schedules
    if (this.PREDEFINED_SCHEDULES[trimmed as keyof typeof this.PREDEFINED_SCHEDULES]) {
      return this.PREDEFINED_SCHEDULES[trimmed as keyof typeof this.PREDEFINED_SCHEDULES];
    }

    return expression.trim();
  }

  /**
   * Generate human-readable description of cron expression
   */
  private static generateDescription(cronExpression: string): string {
    try {
      const parts = cronExpression.split(' ');
      
      if (parts.length === 5) {
        const [minute, hour, day, month, weekday] = parts;
        
        // Handle common patterns
        if (cronExpression === '0 0 * * *') {
          return 'Daily at midnight';
        }
        if (cronExpression === '0 * * * *') {
          return 'Every hour';
        }
        if (cronExpression === '*/5 * * * *') {
          return 'Every 5 minutes';
        }
        if (cronExpression === '0 0 * * 0') {
          return 'Weekly on Sunday at midnight';
        }
        if (cronExpression === '0 0 1 * *') {
          return 'Monthly on the 1st at midnight';
        }

        // Build description from parts
        let description = 'At ';
        
        // Time part
        if (minute === '0' && hour !== '*') {
          description += `${hour}:00`;
        } else if (minute !== '*' && hour !== '*') {
          description += `${hour}:${minute.padStart(2, '0')}`;
        } else if (minute.startsWith('*/')) {
          description += `every ${minute.substring(2)} minutes`;
        } else {
          description += 'various times';
        }

        // Day part
        if (day !== '*') {
          description += ` on day ${day}`;
        }
        
        // Month part
        if (month !== '*') {
          description += ` in month ${month}`;
        }
        
        // Weekday part
        if (weekday !== '*') {
          const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          if (weekday.includes(',')) {
            const days = weekday.split(',').map(d => weekdays[parseInt(d)]).join(', ');
            description += ` on ${days}`;
          } else {
            description += ` on ${weekdays[parseInt(weekday)]}`;
          }
        }

        return description;
      }

      return 'Custom schedule';
    } catch (error) {
      return 'Custom schedule';
    }
  }

  /**
   * Validate timezone and handle DST transitions
   */
  static validateTimezone(timezone: string): boolean {
    try {
      return !!moment.tz.zone(timezone);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get timezone offset for a specific date
   */
  static getTimezoneOffset(timezone: string, date: Date): number {
    try {
      return moment.tz(date, timezone).utcOffset();
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if a date falls within DST for a timezone
   */
  static isDST(timezone: string, date: Date): boolean {
    try {
      return moment.tz(date, timezone).isDST();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get common cron expression examples
   */
  static getExamples(): Array<{ expression: string; description: string }> {
    return [
      { expression: '0 0 * * *', description: 'Daily at midnight' },
      { expression: '0 9 * * *', description: 'Daily at 9:00 AM' },
      { expression: '0 9 * * 1-5', description: 'Weekdays at 9:00 AM' },
      { expression: '0 0 * * 0', description: 'Weekly on Sunday at midnight' },
      { expression: '0 0 1 * *', description: 'Monthly on the 1st at midnight' },
      { expression: '*/15 * * * *', description: 'Every 15 minutes' },
      { expression: '0 */2 * * *', description: 'Every 2 hours' },
      { expression: '0 9,17 * * 1-5', description: 'Weekdays at 9:00 AM and 5:00 PM' },
      { expression: '0 0 1,15 * *', description: 'Twice a month (1st and 15th) at midnight' },
      { expression: '@hourly', description: 'Every hour' },
      { expression: '@daily', description: 'Daily at midnight' },
      { expression: '@weekly', description: 'Weekly on Sunday at midnight' },
    ];
  }
}