export const plugin = {
  name: 'note-taker',
  version: '1.0.0',
  description: 'Extracts key points from text and formats them as notes.',
  permissions: [],
  tools: [
    {
      name: 'take_notes',
      description:
        'Split text into sentences, extract up to 5 key items, and format them as bullets, numbered list, or checklist.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to extract notes from.',
          },
          format: {
            type: 'string',
            description:
              'Output format: bullets, numbered, or checklist. Defaults to checklist.',
          },
        },
        required: ['text'],
      },
      execute: async (params) => {
        const format = ['bullets', 'numbered', 'checklist'].includes(
          params.format,
        )
          ? params.format
          : 'checklist';

        const sentences = params.text
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .slice(0, 5);

        if (sentences.length === 0) {
          return { success: true, output: 'No notes extracted.' };
        }

        const prefixes = {
          bullets: () => '- ',
          numbered: (i) => `${i + 1}. `,
          checklist: () => '- [ ] ',
        };

        const output = sentences
          .map((s, i) => `${prefixes[format](i)}${s}`)
          .join('\n');

        return { success: true, output };
      },
    },
  ],
};
