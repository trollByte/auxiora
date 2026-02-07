import type { OrchestrationEngine, AgentTask, AgentEvent, OrchestrationPattern } from '@auxiora/orchestrator';
import type { Tool, ToolResult, ExecutionContext } from './index.js';
import { ToolPermission } from './index.js';

let orchestrationEngine: OrchestrationEngine | undefined;

export function setOrchestrationEngine(engine: OrchestrationEngine): void {
  orchestrationEngine = engine;
}

interface AgentDefinition {
  name: string;
  provider: string;
  model?: string;
  prompt: string;
  systemPrompt?: string;
  tools?: string[];
}

export const AssembleTeamTool: Tool = {
  name: 'assemble_team',
  description:
    `Assemble a team of AI agents to work on a complex task. Use this when a task benefits from multiple perspectives or needs to be broken into subtasks.

Patterns:
- parallel: Multiple agents work simultaneously, results synthesized
- sequential: Agents work in order, each building on the previous
- debate: Two agents argue opposing positions, a judge decides
- map-reduce: Split work across agents, combine results
- supervisor: You delegate subtasks to specialized workers`,
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Orchestration pattern: parallel, sequential, debate, map-reduce, supervisor',
      required: true,
    },
    {
      name: 'goal',
      type: 'string',
      description: 'The overall goal or question to address',
      required: true,
    },
    {
      name: 'agents',
      type: 'array',
      description: 'Array of agent definitions: [{name, provider, model?, prompt, systemPrompt?}]',
      required: true,
    },
    {
      name: 'synthesisPrompt',
      type: 'string',
      description: 'How to combine results (for parallel/debate)',
      required: false,
    },
  ],
  execute: async (
    params: {
      pattern: string;
      goal: string;
      agents: AgentDefinition[];
      synthesisPrompt?: string;
    },
    _context: ExecutionContext,
  ): Promise<ToolResult> => {
    if (!orchestrationEngine) {
      return {
        success: false,
        error: 'Orchestration engine not initialized. Check that orchestration is enabled in config.',
      };
    }

    const validPatterns = ['parallel', 'sequential', 'debate', 'map-reduce', 'supervisor'];
    if (!validPatterns.includes(params.pattern)) {
      return {
        success: false,
        error: `Invalid pattern: ${params.pattern}. Must be one of: ${validPatterns.join(', ')}`,
      };
    }

    if (!params.agents || params.agents.length === 0) {
      return {
        success: false,
        error: 'At least one agent is required',
      };
    }

    try {
      const tasks: AgentTask[] = params.agents.map((a, i) => ({
        id: `agent-${i}`,
        name: a.name,
        provider: a.provider,
        model: a.model,
        systemPrompt: a.systemPrompt || `You are ${a.name}. Complete the assigned task thoroughly.`,
        userPrompt: a.prompt,
        tools: a.tools,
      }));

      const workflow = {
        id: `wf-${Date.now()}`,
        pattern: params.pattern as OrchestrationPattern,
        tasks,
        synthesisPrompt: params.synthesisPrompt,
      };

      const agentOutputs: Array<{ name: string; provider: string; content: string }> = [];
      const agentProviders = new Map<string, string>();
      let finalResult = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const generator = orchestrationEngine.execute(workflow);
      let iterResult = await generator.next();
      while (!iterResult.done) {
        const event = iterResult.value as AgentEvent;
        if (event.type === 'agent_started') {
          agentProviders.set(event.taskId, event.provider);
        }
        if (event.type === 'agent_completed') {
          agentOutputs.push({
            name: event.name,
            provider: agentProviders.get(event.taskId) ?? '',
            content: event.result,
          });
          totalInputTokens += event.usage.inputTokens;
          totalOutputTokens += event.usage.outputTokens;
        }
        if (event.type === 'workflow_completed') {
          finalResult = event.finalResult;
          totalInputTokens = event.totalUsage.inputTokens;
          totalOutputTokens = event.totalUsage.outputTokens;
        }
        iterResult = await generator.next();
      }

      // Use the OrchestrationResult return value if we didn't get it from events
      if (!finalResult && iterResult.done && iterResult.value) {
        finalResult = iterResult.value.synthesis;
      }

      let output = `## Orchestration Result (${params.pattern})\n\n`;
      for (const agent of agentOutputs) {
        output += `### ${agent.name} [${agent.provider}]\n${agent.content}\n\n`;
      }
      if (finalResult) {
        output += `### Synthesis\n${finalResult}\n`;
      }

      return {
        success: true,
        output,
        metadata: {
          pattern: params.pattern,
          agentCount: agentOutputs.length,
          totalInputTokens,
          totalOutputTokens,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Orchestration failed',
      };
    }
  },
  getPermission: () => ToolPermission.AUTO_APPROVE,
};
