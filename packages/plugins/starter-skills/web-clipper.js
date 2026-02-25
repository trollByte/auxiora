export const plugin = {
  name: 'web-clipper',
  version: '1.0.0',
  description: 'Clip and bookmark URLs as formatted markdown entries.',
  permissions: [],
  tools: [
    {
      name: 'clip_url',
      description:
        'Save a URL as a formatted markdown bookmark with optional title and tags.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to clip.' },
          title: {
            type: 'string',
            description: 'Bookmark title. Defaults to the URL if omitted.',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags for the bookmark.',
          },
        },
        required: ['url'],
      },
      execute: async (params) => {
        const { url, title, tags } = params;
        const displayTitle = title || url;
        const saved = new Date().toISOString();

        const hashtags = tags
          ? tags
              .split(',')
              .map((t) => `#${t.trim()}`)
              .join(' ')
          : '';

        const lines = [
          `## [${displayTitle}](${url})`,
          '',
          `- **Saved**: ${saved}`,
        ];

        if (hashtags) {
          lines.push(`- **Tags**: ${hashtags}`);
        }

        return { success: true, output: lines.join('\n') };
      },
    },
  ],
};
