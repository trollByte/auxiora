import type { TrustGate } from '@auxiora/autonomy';
import type { ActionAuditTrail } from '@auxiora/autonomy';
import type { ConnectorRegistry } from './registry.js';
import type { AuthManager } from './auth-manager.js';
import type { TrustDomain, TrustLevel } from '@auxiora/autonomy';

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  auditId?: string;
}

export class ActionExecutor {
  private registry: ConnectorRegistry;
  private authManager: AuthManager;
  private trustGate: TrustGate;
  private auditTrail: ActionAuditTrail;

  constructor(
    registry: ConnectorRegistry,
    authManager: AuthManager,
    trustGate: TrustGate,
    auditTrail: ActionAuditTrail,
  ) {
    this.registry = registry;
    this.authManager = authManager;
    this.trustGate = trustGate;
    this.auditTrail = auditTrail;
  }

  async execute(
    connectorId: string,
    actionId: string,
    params: Record<string, unknown>,
    instanceId: string,
  ): Promise<ExecutionResult> {
    const connector = this.registry.get(connectorId);
    if (!connector) {
      return { success: false, error: `Connector "${connectorId}" not found` };
    }

    const action = connector.actions.find((a) => a.id === actionId);
    if (!action) {
      return { success: false, error: `Action "${actionId}" not found in connector "${connectorId}"` };
    }

    // Check trust gate
    const gateResult = this.trustGate.gate(
      action.trustDomain,
      `${connectorId}:${actionId}`,
      action.trustMinimum,
    );

    if (!gateResult.allowed) {
      const audit = await this.auditTrail.record({
        trustLevel: gateResult.currentLevel,
        domain: action.trustDomain,
        intent: `${connectorId}:${actionId}`,
        plan: JSON.stringify(params),
        executed: false,
        outcome: 'failure',
        reasoning: gateResult.message,
        rollbackAvailable: false,
      });
      return { success: false, error: gateResult.message, auditId: audit.id };
    }

    // Get token
    const token = this.authManager.getToken(instanceId);
    if (!token) {
      return { success: false, error: `No authentication token for instance "${instanceId}"` };
    }

    // Execute
    try {
      const data = await connector.executeAction(actionId, params, token.accessToken);

      const audit = await this.auditTrail.record({
        trustLevel: gateResult.currentLevel,
        domain: action.trustDomain,
        intent: `${connectorId}:${actionId}`,
        plan: JSON.stringify(params),
        executed: true,
        outcome: 'success',
        reasoning: gateResult.message,
        rollbackAvailable: action.reversible,
      });

      return { success: true, data, auditId: audit.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';

      const audit = await this.auditTrail.record({
        trustLevel: gateResult.currentLevel,
        domain: action.trustDomain,
        intent: `${connectorId}:${actionId}`,
        plan: JSON.stringify(params),
        executed: true,
        outcome: 'failure',
        reasoning: msg,
        rollbackAvailable: false,
      });

      return { success: false, error: msg, auditId: audit.id };
    }
  }
}
