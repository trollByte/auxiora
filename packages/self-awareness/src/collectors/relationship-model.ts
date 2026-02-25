import type {
  SignalCollector, CollectionContext, PostResponseContext, AwarenessSignal, AwarenessStorage,
} from '../types.js';

interface UserProfile {
  interactionCount: number;
  preferredVerbosity: 'concise' | 'detailed' | 'unknown';
  expertiseDomains: string[];
  topTopics: string[];
  avgUserMsgLength: number;
  lastSeen: number;
}

const EXPERTISE_PATTERNS = [
  'actually,', "that's not right", 'you need to use', 'the correct way',
  'it should be', 'you missed', "that's incorrect",
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  typescript: ['typescript', 'generics', 'type', 'interface', 'tsconfig'],
  security: ['vulnerability', 'encryption', 'auth', 'security', 'cve'],
  kubernetes: ['kubernetes', 'k8s', 'pod', 'deployment', 'helm'],
  react: ['react', 'component', 'hooks', 'jsx', 'useState'],
  python: ['python', 'pip', 'django', 'flask', 'pytest'],
  devops: ['docker', 'ci/cd', 'pipeline', 'terraform', 'ansible'],
  database: ['sql', 'postgres', 'mongodb', 'database', 'query'],
};

function defaultProfile(): UserProfile {
  return {
    interactionCount: 0, preferredVerbosity: 'unknown',
    expertiseDomains: [], topTopics: [], avgUserMsgLength: 0, lastSeen: Date.now(),
  };
}

export class RelationshipModel implements SignalCollector {
  readonly name = 'relationship-model';
  enabled = true;

  constructor(private storage: AwarenessStorage) {}

  async collect(context: CollectionContext): Promise<AwarenessSignal[]> {
    const profile = await this.storage.read('relationships', context.userId) as UserProfile | null;
    if (!profile || profile.interactionCount === 0) return [];

    const parts: string[] = [];
    if (profile.preferredVerbosity !== 'unknown') parts.push(`Prefers ${profile.preferredVerbosity} responses`);
    if (profile.expertiseDomains.length > 0) parts.push(`Expert in ${profile.expertiseDomains.join(', ')}`);
    if (profile.topTopics.length > 0) parts.push(`Usually asks about ${profile.topTopics.join(', ')}`);
    parts.push(`${profile.interactionCount} prior interactions`);

    return [{
      dimension: this.name,
      priority: 0.7,
      text: `User profile: ${parts.join('. ')}.`,
      data: { ...profile },
    }];
  }

  async afterResponse(context: PostResponseContext): Promise<void> {
    const existing = await this.storage.read('relationships', context.userId) as UserProfile | null;
    const profile = existing ?? defaultProfile();

    profile.interactionCount++;
    profile.lastSeen = Date.now();

    const userLen = context.currentMessage.length;
    profile.avgUserMsgLength = profile.interactionCount === 1
      ? userLen
      : profile.avgUserMsgLength * 0.8 + userLen * 0.2;

    if (profile.interactionCount >= 5) {
      profile.preferredVerbosity = profile.avgUserMsgLength < 50 ? 'concise' : 'detailed';
    }

    const msgLower = context.currentMessage.toLowerCase();
    if (EXPERTISE_PATTERNS.some(p => msgLower.includes(p))) {
      for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        if (keywords.some(k => msgLower.includes(k)) && !profile.expertiseDomains.includes(domain)) {
          profile.expertiseDomains.push(domain);
        }
      }
    }

    if (profile.expertiseDomains.length > 10) profile.expertiseDomains = profile.expertiseDomains.slice(-10);

    await this.storage.write('relationships', context.userId, profile as unknown as Record<string, unknown>);
  }
}
