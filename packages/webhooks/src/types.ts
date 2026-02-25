export interface WebhookDefinition {
  id: string;
  name: string;
  type: 'channel' | 'generic';
  channelType?: string;
  secret: string;
  behaviorId?: string;
  transform?: string;
  enabled: boolean;
  createdAt: string;
}

export interface WebhookConfig {
  enabled: boolean;
  basePath: string;
  signatureHeader: string;
  maxPayloadSize: number;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  basePath: '/api/v1/webhooks',
  signatureHeader: 'x-webhook-signature',
  maxPayloadSize: 65536,
};
