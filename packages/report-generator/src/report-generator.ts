import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { format, formatDuration as formatDurationFns } from 'date-fns';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';

import {
  ReportConfig,
  ReportData,
  ReportResult,
  TestExecution,
  HistoricalData,
} from './types';

export class ReportGenerator {
  private config: ReportConfig;
  private chartRenderer: ChartJSNodeCanvas;

  constructor(config: ReportConfig) {
    this.config = config;
    this.chartRenderer = new ChartJSNodeCanvas({
      width: 800,
      height: 400,
      backgroundColour: 'white',
    });

    this.registerHandlebarsHelpers();
  }

  private registerHandlebarsHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return format(new Date(date), 'PPpp');
    });

    Handlebars.registerHelper('formatDuration', (duration: number) => {
      if (!duration) return '0ms';
      if (duration < 1000) return `${duration}ms`;
      if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
      return `${(duration / 60000).toFixed(1)}m`;
    });

    Handlebars.registerHelper('formatPercentage', (value: number) => {
      return (value * 100).toFixed(1);
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
    Handlebars.registerHelper('lt', (a: number, b: number) => a < b);
  }

  async generateReport(data: ReportData): Promise<ReportResult> {
    try {
      // Prepare report data with additional calculations
      const enrichedData = await this.enrichReportData(data);

      // Generate charts if enabled
      if (this.config.includeCharts) {
        await this.generateCharts(enrichedData);
      }

      // Generate report based on format
      switch (this.config.output.format) {
        case 'html':
          return await this.generateHTMLReport(enrichedData);
        case 'pdf':
          return await this.generatePDFReport(enrichedData);
        case 'json':
          return await this.generateJSONReport(enrichedData);
        default:
          throw new Error(`Unsupported output format: ${this.config.output.format}`);
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate report: ${error}`,
      };
    }
  }

  private async enrichReportData(data: ReportData): Promise<ReportData> {
    // Calculate additional metrics
    const enrichedExecutions = data.executions.map(execution => ({
      ...execution,
      duration: execution.endTime && execution.startTime
        ? execution.endTime.getTime() - execution.startTime.getTime()
        : 0,
      steps: execution.steps.map(step => ({
        ...step,
        duration: step.endTime && step.startTime
          ? step.endTime.getTime() - step.startTime.getTime()
          : 0,
      })),
    }));

    // Calculate summary statistics
    const summary = {
      ...data.summary,
      totalDuration: enrichedExecutions.reduce((sum, exec) => sum + (exec.duration || 0), 0),
      avgDuration: enrichedExecutions.length > 0
        ? enrichedExecutions.reduce((sum, exec) => sum + (exec.duration || 0), 0) / enrichedExecutions.length
        : 0,
    };

    return {
      ...data,
      summary,
      executions: enrichedExecutions,
    };
  }

  private async generateCharts(data: ReportData): Promise<void> {
    // Generate success rate chart
    if (data.historical && data.historical.length > 0) {
      await this.generateSuccessRateChart(data.historical);
      await this.generateDurationTrendChart(data.historical);
    }

    // Generate test status pie chart
    await this.generateStatusPieChart(data.summary);
  }

  private async generateSuccessRateChart(historical: HistoricalData[]): Promise<void> {
    const chartConfig = {
      type: 'line' as const,
      data: {
        labels: historical.map(h => format(h.date, 'MMM dd')),
        datasets: [{
          label: 'Success Rate (%)',
          data: historical.map(h => h.successRate * 100),
          borderColor: this.config.branding.colors.success,
          backgroundColor: this.config.branding.colors.success + '20',
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Success Rate Trend',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
          },
        },
      },
    };

    const chartBuffer = await this.chartRenderer.renderToBuffer(chartConfig);
    this.saveChart('success-rate-trend.png', chartBuffer);
  }

  private async generateDurationTrendChart(historical: HistoricalData[]): Promise<void> {
    const chartConfig = {
      type: 'line' as const,
      data: {
        labels: historical.map(h => format(h.date, 'MMM dd')),
        datasets: [{
          label: 'Average Duration (ms)',
          data: historical.map(h => h.avgDuration),
          borderColor: this.config.branding.colors.primary,
          backgroundColor: this.config.branding.colors.primary + '20',
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Average Test Duration Trend',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    };

    const chartBuffer = await this.chartRenderer.renderToBuffer(chartConfig);
    this.saveChart('duration-trend.png', chartBuffer);
  }

  private async generateStatusPieChart(summary: ReportData['summary']): Promise<void> {
    const chartConfig = {
      type: 'pie' as const,
      data: {
        labels: ['Passed', 'Failed', 'Skipped'],
        datasets: [{
          data: [summary.passed, summary.failed, summary.skipped],
          backgroundColor: [
            this.config.branding.colors.success,
            this.config.branding.colors.error,
            '#6c757d',
          ],
        }],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Test Results Distribution',
          },
        },
      },
    };

    const chartBuffer = await this.chartRenderer.renderToBuffer(chartConfig);
    this.saveChart('test-status-distribution.png', chartBuffer);
  }

  private saveChart(filename: string, buffer: Buffer): void {
    const chartsDir = join(process.cwd(), 'reports', 'charts');
    if (!existsSync(chartsDir)) {
      mkdirSync(chartsDir, { recursive: true });
    }
    writeFileSync(join(chartsDir, filename), buffer);
  }

  private async generateHTMLReport(data: ReportData): Promise<ReportResult> {
    try {
      const templatePath = join(__dirname, 'templates', `${this.config.template}.hbs`);
      const templateContent = readFileSync(templatePath, 'utf-8');
      const template = Handlebars.compile(templateContent);

      const html = template({
        ...data,
        config: this.config,
      });

      const filename = this.config.output.filename || `report-${Date.now()}.html`;
      const reportsDir = join(process.cwd(), 'reports');
      if (!existsSync(reportsDir)) {
        mkdirSync(reportsDir, { recursive: true });
      }

      const filePath = join(reportsDir, filename);
      writeFileSync(filePath, html, 'utf-8');

      return {
        success: true,
        filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate HTML report: ${error}`,
      };
    }
  }

  private async generatePDFReport(data: ReportData): Promise<ReportResult> {
    try {
      // First generate HTML
      const htmlResult = await this.generateHTMLReport(data);
      if (!htmlResult.success || !htmlResult.filePath) {
        return htmlResult;
      }

      // Convert HTML to PDF using Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      const htmlContent = readFileSync(htmlResult.filePath, 'utf-8');
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const filename = this.config.output.filename?.replace('.html', '.pdf') || `report-${Date.now()}.pdf`;
      const filePath = join(dirname(htmlResult.filePath), filename);

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      await browser.close();

      return {
        success: true,
        filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate PDF report: ${error}`,
      };
    }
  }

  private async generateJSONReport(data: ReportData): Promise<ReportResult> {
    try {
      const filename = this.config.output.filename || `report-${Date.now()}.json`;
      const reportsDir = join(process.cwd(), 'reports');
      if (!existsSync(reportsDir)) {
        mkdirSync(reportsDir, { recursive: true });
      }

      const filePath = join(reportsDir, filename);
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

      return {
        success: true,
        filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate JSON report: ${error}`,
      };
    }
  }

  async generateHistoricalAnalysis(executions: TestExecution[]): Promise<HistoricalData[]> {
    // Group executions by date
    const groupedByDate = _.groupBy(executions, (exec) =>
      format(exec.startTime, 'yyyy-MM-dd')
    );

    return Object.entries(groupedByDate).map(([dateStr, dayExecutions]) => {
      const totalTests = dayExecutions.length;
      const passed = dayExecutions.filter(e => e.status === 'passed').length;
      const failed = dayExecutions.filter(e => e.status === 'failed').length;
      const avgDuration = dayExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / totalTests;

      return {
        date: new Date(dateStr),
        totalTests,
        passed,
        failed,
        successRate: totalTests > 0 ? passed / totalTests : 0,
        avgDuration,
      };
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}