import type { ConversationTree } from './types.js';

export class BranchVisualizer {
  toAsciiTree(tree: ConversationTree): string {
    const lines: string[] = [];
    const visited = new Set<string>();

    const renderBranch = (branchId: string, indent: string, isLast: boolean): void => {
      if (visited.has(branchId)) return;
      visited.add(branchId);

      const branch = tree.branches.get(branchId);
      if (!branch) return;

      const connector = indent === '' ? '' : isLast ? '└── ' : '├── ';
      const label = branch.label ?? branchId.slice(0, 8);
      const active = branch.isActive ? ' *' : '';
      const msgCount = branch.messages.length;

      lines.push(`${indent}${connector}[${label}] (${msgCount} msgs)${active}`);

      // Find child branches (branches that forked from messages in this branch)
      const childBranchIds: string[] = [];
      for (const msg of branch.messages) {
        const bp = tree.branchPoints.get(msg.id);
        if (bp) {
          for (const childId of bp.branchIds) {
            if (!visited.has(childId)) {
              childBranchIds.push(childId);
            }
          }
        }
      }

      const childIndent = indent === '' ? '' : indent + (isLast ? '    ' : '│   ');
      for (let i = 0; i < childBranchIds.length; i++) {
        const isChildLast = i === childBranchIds.length - 1;
        renderBranch(childBranchIds[i], childIndent, isChildLast);
      }
    };

    renderBranch(tree.rootBranchId, '', true);
    return lines.join('\n');
  }

  toMarkdown(tree: ConversationTree): string {
    const lines: string[] = ['# Conversation Branches', ''];

    const branches = Array.from(tree.branches.values());
    for (const branch of branches) {
      const label = branch.label ?? branch.id.slice(0, 8);
      const active = branch.isActive ? ' (active)' : '';
      const parent = branch.parentBranchId
        ? ` | parent: ${branch.parentBranchId.slice(0, 8)}`
        : ' | root';
      lines.push(`- **${label}**${active}: ${branch.messages.length} messages${parent}`);
    }

    return lines.join('\n');
  }

  getSummary(tree: ConversationTree): {
    branchCount: number;
    messageCount: number;
    maxDepth: number;
    forkPoints: number;
  } {
    const branchCount = tree.branches.size;
    let messageCount = 0;
    for (const branch of tree.branches.values()) {
      messageCount += branch.messages.length;
    }
    const forkPoints = tree.branchPoints.size;

    // Calculate max depth by traversing parent chains
    let maxDepth = 0;
    for (const branch of tree.branches.values()) {
      let depth = 0;
      let current: string | undefined = branch.parentBranchId;
      while (current) {
        depth++;
        const parent = tree.branches.get(current);
        current = parent?.parentBranchId;
      }
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }

    return { branchCount, messageCount, maxDepth, forkPoints };
  }
}
