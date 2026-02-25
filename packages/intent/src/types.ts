export type IntentType =
  | 'send_message'
  | 'read_message'
  | 'search'
  | 'create_file'
  | 'read_file'
  | 'edit_file'
  | 'delete_file'
  | 'browse_web'
  | 'run_command'
  | 'schedule'
  | 'remind'
  | 'query'
  | 'summarize'
  | 'translate'
  | 'compose'
  | 'analyze'
  | 'configure'
  | 'unknown';

export interface IntentEntity {
  type: string;
  value: string;
  start: number;
  end: number;
}

export interface ActionStep {
  id: string;
  action: string;
  domain: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  description: string;
}

export interface Intent {
  type: IntentType;
  confidence: number;
  entities: IntentEntity[];
  requiredConnectors: string[];
  actionSteps: ActionStep[];
  rawText: string;
}

export interface IntentParserConfig {
  /** Minimum confidence threshold to accept a classification. */
  confidenceThreshold: number;
}

export const DEFAULT_INTENT_PARSER_CONFIG: IntentParserConfig = {
  confidenceThreshold: 0.3,
};
