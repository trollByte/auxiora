import { getLogger } from '@auxiora/logger';
import type { HumanWorkflow, ReminderConfig } from './types.js';

const logger = getLogger('workflows:reminder');

export interface ReminderTarget {
  userId: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  workflowName: string;
}

export interface ReminderSender {
  sendReminder(target: ReminderTarget, channelType?: string): Promise<void>;
}

interface ScheduledReminder {
  workflowId: string;
  stepId: string;
  timer: ReturnType<typeof setInterval>;
  count: number;
  maxReminders: number;
}

export class ReminderService {
  private reminders = new Map<string, ScheduledReminder>();
  private sender?: ReminderSender;

  setSender(sender: ReminderSender): void {
    this.sender = sender;
  }

  scheduleReminder(
    workflow: HumanWorkflow,
    stepId: string,
    config?: Partial<ReminderConfig>,
  ): void {
    const key = `${workflow.id}:${stepId}`;
    if (this.reminders.has(key)) return;

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) return;

    const intervalMs = config?.intervalMs ?? workflow.reminder.intervalMs;
    const maxReminders = config?.maxReminders ?? workflow.reminder.maxReminders;

    const scheduled: ScheduledReminder = {
      workflowId: workflow.id,
      stepId,
      count: 0,
      maxReminders,
      timer: setInterval(() => {
        void this.sendReminder(workflow, stepId, scheduled);
      }, intervalMs),
    };

    this.reminders.set(key, scheduled);
    logger.debug('Scheduled reminder', { workflowId: workflow.id, stepId, intervalMs });
  }

  cancelReminder(workflowId: string, stepId: string): void {
    const key = `${workflowId}:${stepId}`;
    const reminder = this.reminders.get(key);
    if (reminder) {
      clearInterval(reminder.timer);
      this.reminders.delete(key);
      logger.debug('Cancelled reminder', { workflowId, stepId });
    }
  }

  cancelAllForWorkflow(workflowId: string): void {
    for (const [key, reminder] of this.reminders) {
      if (reminder.workflowId === workflowId) {
        clearInterval(reminder.timer);
        this.reminders.delete(key);
      }
    }
  }

  shutdown(): void {
    for (const [, reminder] of this.reminders) {
      clearInterval(reminder.timer);
    }
    this.reminders.clear();
  }

  getActiveCount(): number {
    return this.reminders.size;
  }

  private async sendReminder(
    workflow: HumanWorkflow,
    stepId: string,
    scheduled: ScheduledReminder,
  ): Promise<void> {
    scheduled.count++;

    if (scheduled.count > scheduled.maxReminders) {
      this.cancelReminder(workflow.id, stepId);
      return;
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step || step.status !== 'active') {
      this.cancelReminder(workflow.id, stepId);
      return;
    }

    if (this.sender) {
      try {
        await this.sender.sendReminder({
          userId: step.assigneeId,
          workflowId: workflow.id,
          stepId,
          stepName: step.name,
          workflowName: workflow.name,
        });
        logger.debug('Sent reminder', {
          workflowId: workflow.id,
          stepId,
          count: scheduled.count,
        });
      } catch (error) {
        logger.debug('Failed to send reminder', { error: error as Error });
      }
    }
  }
}
