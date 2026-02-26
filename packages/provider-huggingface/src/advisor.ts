import type { DiscoveredModelLike, HFModelComparison } from './types.js';

interface AdviceResult {
  recommended: string;
  reasoning: string;
  alternatives: Array<{ model: string; reason: string }>;
}

export class HFModelAdvisor {
  constructor(private models: DiscoveredModelLike[]) {}

  advise(
    taskType: string,
    preferences?: { maxCost?: number; minContext?: number; needsVision?: boolean },
  ): AdviceResult {
    let candidates = this.models.filter(m => m.enabled);

    // Filter by capabilities
    if (preferences?.needsVision) {
      candidates = candidates.filter(m => m.supportsVision);
    }
    if (preferences?.minContext) {
      candidates = candidates.filter(m => m.contextLength >= preferences.minContext!);
    }
    if (preferences?.maxCost !== undefined) {
      candidates = candidates.filter(m => m.costPer1kInput <= preferences.maxCost!);
    }

    // Score by relevance to task
    const scored = candidates.map(m => {
      let score = 0;
      if (m.strengths.includes(taskType)) score += 10;
      if (m.hfTrendingScore) score += m.hfTrendingScore * 5;
      if (m.hfDownloads) score += Math.log10(m.hfDownloads);
      if (m.hfLikes) score += Math.log10(m.hfLikes);
      // Prefer cheaper models slightly
      score -= m.costPer1kInput * 100;
      return { model: m, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        recommended: '',
        reasoning: 'No models match the given criteria.',
        alternatives: [],
      };
    }

    const top = scored[0]!;
    const alternatives = scored.slice(1, 4).map(s => ({
      model: s.model.modelId,
      reason: `Score: ${s.score.toFixed(1)} — ${s.model.strengths.join(', ')}`,
    }));

    return {
      recommended: top.model.modelId,
      reasoning: `Best match for "${taskType}" with score ${top.score.toFixed(1)}. Strengths: ${top.model.strengths.join(', ')}.` +
        (top.model.hfTrendingScore ? ` Trending: ${top.model.hfTrendingScore.toFixed(2)}.` : ''),
      alternatives,
    };
  }

  compare(modelAId: string, modelBId: string): HFModelComparison {
    const a = this.models.find(m => m.modelId === modelAId);
    const b = this.models.find(m => m.modelId === modelBId);

    const benchmarks: Record<string, { a: number | null; b: number | null; winner: string }> = {};

    // Compare on available dimensions
    const dimensions = [
      { name: 'context_length', getVal: (m: DiscoveredModelLike) => m.contextLength },
      { name: 'cost_input', getVal: (m: DiscoveredModelLike) => -m.costPer1kInput }, // lower is better
      { name: 'cost_output', getVal: (m: DiscoveredModelLike) => -m.costPer1kOutput },
      { name: 'downloads', getVal: (m: DiscoveredModelLike) => m.hfDownloads ?? 0 },
      { name: 'likes', getVal: (m: DiscoveredModelLike) => m.hfLikes ?? 0 },
      { name: 'trending', getVal: (m: DiscoveredModelLike) => m.hfTrendingScore ?? 0 },
    ];

    for (const dim of dimensions) {
      const valA = a ? dim.getVal(a) : null;
      const valB = b ? dim.getVal(b) : null;
      let winner = 'tie';
      if (valA !== null && valB !== null) {
        if (valA > valB) winner = modelAId;
        else if (valB > valA) winner = modelBId;
      }
      benchmarks[dim.name] = { a: valA, b: valB, winner };
    }

    const aWins = Object.values(benchmarks).filter(b => b.winner === modelAId).length;
    const bWins = Object.values(benchmarks).filter(b => b.winner === modelBId).length;

    return {
      modelA: modelAId,
      modelB: modelBId,
      benchmarks,
      recommendation: aWins > bWins
        ? `${modelAId} wins on ${aWins}/${dimensions.length} dimensions`
        : bWins > aWins
          ? `${modelBId} wins on ${bWins}/${dimensions.length} dimensions`
          : 'Models are comparable across measured dimensions',
    };
  }
}
