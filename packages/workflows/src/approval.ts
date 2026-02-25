import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getAuxioraDir } from '@auxiora/core';

const logger = getLogger('workflows:approval');

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  stepId: string;
  requestedBy: string;
  approverIds: string[];
  description: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decisionReason?: string;
  createdAt: number;
  decidedAt?: number;
  expiresAt?: number;
}

export class ApprovalManager {
  private filePath: string;

  constructor(options?: { dir?: string }) {
    const dir = options?.dir ?? path.join(getAuxioraDir(), 'workflows');
    this.filePath = path.join(dir, 'approvals.json');
  }

  async requestApproval(
    workflowId: string,
    stepId: string,
    requestedBy: string,
    approverIds: string[],
    description: string,
    expiresInMs?: number,
  ): Promise<ApprovalRequest> {
    const approvals = await this.readFile();
    const now = Date.now();

    const request: ApprovalRequest = {
      id: `appr-${crypto.randomUUID().slice(0, 8)}`,
      workflowId,
      stepId,
      requestedBy,
      approverIds,
      description,
      status: 'pending',
      createdAt: now,
      ...(expiresInMs ? { expiresAt: now + expiresInMs } : {}),
    };

    approvals.push(request);
    await this.writeFile(approvals);
    void audit('workflow.approval_requested', { id: request.id, workflowId, stepId });
    logger.debug('Approval requested', { id: request.id });
    return request;
  }

  async approve(approvalId: string, decidedBy: string, reason?: string): Promise<ApprovalRequest | undefined> {
    return this.decide(approvalId, 'approved', decidedBy, reason);
  }

  async reject(approvalId: string, decidedBy: string, reason?: string): Promise<ApprovalRequest | undefined> {
    return this.decide(approvalId, 'rejected', decidedBy, reason);
  }

  async getPending(userId?: string): Promise<ApprovalRequest[]> {
    const approvals = await this.readFile();
    const now = Date.now();

    return approvals.filter(a => {
      if (a.status !== 'pending') return false;
      if (a.expiresAt && a.expiresAt <= now) return false;
      if (userId && !a.approverIds.includes(userId)) return false;
      return true;
    });
  }

  async getByWorkflow(workflowId: string): Promise<ApprovalRequest[]> {
    const approvals = await this.readFile();
    return approvals.filter(a => a.workflowId === workflowId);
  }

  async get(approvalId: string): Promise<ApprovalRequest | undefined> {
    const approvals = await this.readFile();
    return approvals.find(a => a.id === approvalId);
  }

  private async decide(
    approvalId: string,
    status: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
  ): Promise<ApprovalRequest | undefined> {
    const approvals = await this.readFile();
    const approval = approvals.find(a => a.id === approvalId);
    if (!approval || approval.status !== 'pending') return undefined;

    if (!approval.approverIds.includes(decidedBy)) return undefined;

    approval.status = status;
    approval.decidedBy = decidedBy;
    approval.decisionReason = reason;
    approval.decidedAt = Date.now();

    await this.writeFile(approvals);
    void audit(`workflow.${status}`, { id: approvalId, decidedBy });
    logger.debug(`Approval ${status}`, { id: approvalId, decidedBy });
    return approval;
  }

  private async readFile(): Promise<ApprovalRequest[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as ApprovalRequest[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(approvals: ApprovalRequest[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(approvals, null, 2), 'utf-8');
  }
}
