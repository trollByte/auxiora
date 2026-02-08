import * as crypto from 'node:crypto';
import type { Intent, ActionStep } from './types.js';

const INTENT_TO_DOMAIN: Record<string, string> = {
  send_message: 'messaging',
  read_message: 'messaging',
  search: 'web',
  create_file: 'files',
  read_file: 'files',
  edit_file: 'files',
  delete_file: 'files',
  browse_web: 'web',
  run_command: 'shell',
  schedule: 'calendar',
  remind: 'calendar',
  query: 'web',
  summarize: 'web',
  translate: 'web',
  compose: 'messaging',
  analyze: 'web',
  configure: 'system',
};

function makeStep(action: string, domain: string, description: string, params: Record<string, unknown> = {}, dependsOn: string[] = []): ActionStep {
  return {
    id: crypto.randomUUID(),
    action,
    domain,
    params,
    dependsOn,
    description,
  };
}

export class ActionPlanner {
  planActions(intent: Intent): ActionStep[] {
    const domain = INTENT_TO_DOMAIN[intent.type] ?? 'system';
    const steps: ActionStep[] = [];

    switch (intent.type) {
      case 'send_message': {
        const recipient = intent.entities.find((e) => e.type === 'mention')?.value;
        steps.push(makeStep('send_message', domain, `Send message${recipient ? ` to ${recipient}` : ''}`, {
          recipient,
          content: intent.rawText,
        }));
        break;
      }

      case 'read_message': {
        steps.push(makeStep('read_messages', domain, 'Read recent messages'));
        break;
      }

      case 'search': {
        steps.push(makeStep('web_search', domain, 'Search the web', { query: intent.rawText }));
        break;
      }

      case 'create_file': {
        const filePath = intent.entities.find((e) => e.type === 'file_path')?.value;
        steps.push(makeStep('create_file', domain, `Create file${filePath ? ` at ${filePath}` : ''}`, {
          path: filePath,
        }));
        break;
      }

      case 'read_file': {
        const filePath = intent.entities.find((e) => e.type === 'file_path')?.value;
        steps.push(makeStep('read_file', domain, `Read file${filePath ? ` ${filePath}` : ''}`, {
          path: filePath,
        }));
        break;
      }

      case 'edit_file': {
        const filePath = intent.entities.find((e) => e.type === 'file_path')?.value;
        const readStep = makeStep('read_file', domain, 'Read current file contents', { path: filePath });
        const editStep = makeStep('edit_file', domain, 'Apply edits to file', { path: filePath }, [readStep.id]);
        steps.push(readStep, editStep);
        break;
      }

      case 'delete_file': {
        const filePath = intent.entities.find((e) => e.type === 'file_path')?.value;
        steps.push(makeStep('delete_file', domain, `Delete file${filePath ? ` ${filePath}` : ''}`, {
          path: filePath,
        }));
        break;
      }

      case 'browse_web': {
        const url = intent.entities.find((e) => e.type === 'url')?.value;
        steps.push(makeStep('navigate', domain, `Browse to ${url ?? 'URL'}`, { url }));
        break;
      }

      case 'run_command': {
        steps.push(makeStep('run_command', domain, 'Run shell command', { command: intent.rawText }));
        break;
      }

      case 'schedule': {
        const date = intent.entities.find((e) => e.type === 'date')?.value;
        const time = intent.entities.find((e) => e.type === 'time')?.value;
        steps.push(makeStep('create_event', domain, 'Create calendar event', {
          date,
          time,
          description: intent.rawText,
        }));
        break;
      }

      case 'remind': {
        const date = intent.entities.find((e) => e.type === 'date')?.value;
        const time = intent.entities.find((e) => e.type === 'time')?.value;
        steps.push(makeStep('create_reminder', domain, 'Create reminder', {
          date,
          time,
          description: intent.rawText,
        }));
        break;
      }

      case 'compose': {
        const recipient = intent.entities.find((e) => e.type === 'email' || e.type === 'mention')?.value;
        steps.push(makeStep('compose', domain, 'Compose message', {
          recipient,
          content: intent.rawText,
        }));
        break;
      }

      case 'summarize':
      case 'translate':
      case 'analyze':
      case 'query': {
        steps.push(makeStep(intent.type, domain, `${intent.type} content`, { input: intent.rawText }));
        break;
      }

      case 'configure': {
        steps.push(makeStep('configure', domain, 'Update configuration', { input: intent.rawText }));
        break;
      }

      default: {
        steps.push(makeStep('unknown', 'system', 'Process request', { input: intent.rawText }));
        break;
      }
    }

    return steps;
  }
}
