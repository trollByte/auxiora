import type { Tool, ToolParameter, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:research');

let researchEngine: any = null;

export function setResearchEngine(engine: any): void {
  researchEngine = engine;
  logger.info('Research engine connected to tools');
}

export const ResearchTool: Tool = {
  name: 'research',
  description: 'Research a topic by gathering information from multiple sources, evaluating credibility, and producing a synthesized summary with citations. Call this when the user asks to research something, needs a deep dive, or wants a comprehensive answer on a topic.',

  parameters: [
    {
      name: 'topic',
      type: 'string',
      description: 'The topic or question to research',
      required: true,
    },
    {
      name: 'depth',
      type: 'string',
      description: 'Research depth: "quick" (1-3 sources), "standard" (3-5 sources), or "deep" (5-10 sources)',
      required: false,
      default: 'standard',
    },
    {
      name: 'focusAreas',
      type: 'string',
      description: 'Comma-separated focus areas to narrow the research',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      if (!researchEngine) {
        return { success: false, error: 'Research requires a Brave Search API key. Set AUXIORA_RESEARCH_BRAVE_API_KEY in your environment or add braveApiKey to research config.' };
      }

      const focusAreas = params.focusAreas
        ? params.focusAreas.split(',').map((a: string) => a.trim())
        : undefined;

      const result = await researchEngine.research({
        topic: params.topic,
        depth: params.depth || 'standard',
        focusAreas,
      });

      return {
        success: true,
        output: JSON.stringify({
          summary: result.executiveSummary,
          confidence: result.confidence,
          findingCount: result.findings.length,
          sourceCount: result.sources.length,
          findings: result.findings.map((f: any) => ({
            content: f.content,
            relevance: f.relevance,
            category: f.category,
          })),
          sources: result.sources.map((s: any) => ({
            title: s.title,
            url: s.url,
            credibility: s.credibilityScore,
          })),
          durationMs: result.durationMs,
        }, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
