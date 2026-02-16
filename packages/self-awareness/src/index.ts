export type {
  AwarenessSignal,
  CollectionContext,
  PostResponseContext,
  SignalCollector,
  AwarenessStorage,
  SelfAwarenessConfig,
} from './types.js';

export { SelfAwarenessAssembler, type AssemblerOptions } from './assembler.js';
export { InMemoryAwarenessStorage } from './storage.js';
export { ConversationReflector } from './collectors/conversation-reflector.js';
export { CapacityMonitor } from './collectors/capacity-monitor.js';
export { KnowledgeBoundary } from './collectors/knowledge-boundary.js';
export { RelationshipModel } from './collectors/relationship-model.js';
export { TemporalTracker } from './collectors/temporal-tracker.js';
export { EnvironmentSensor } from './collectors/environment-sensor.js';
export { MetaCognitor } from './collectors/meta-cognitor.js';
