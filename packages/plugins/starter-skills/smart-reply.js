export const plugin = {
  name: 'smart-reply',
  version: '1.0.0',
  description: 'Generates contextual reply suggestions for a given message.',
  permissions: [],
  tools: [
    {
      name: 'smart_reply',
      description:
        'Generate 3 contextual reply suggestions for a message. Supports casual, professional, and friendly tones.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to generate replies for.',
          },
          tone: {
            type: 'string',
            description:
              'Tone of the replies: casual, professional, or friendly. Defaults to casual.',
          },
        },
        required: ['message'],
      },
      execute: async (params) => {
        const tone = ['casual', 'professional', 'friendly'].includes(
          params.tone,
        )
          ? params.tone
          : 'casual';

        const templates = {
          casual: [
            'Sure thing, sounds good!',
            'Got it, thanks for letting me know.',
            'No worries, I\'ll take care of it.',
          ],
          professional: [
            'Thank you for your message. I will review and respond shortly.',
            'Acknowledged. I will prioritize this accordingly.',
            'Understood. Please let me know if further details are needed.',
          ],
          friendly: [
            'Awesome, thanks for sharing!',
            'That sounds great, happy to help!',
            'Love it! Let me know if you need anything else.',
          ],
        };

        const replies = templates[tone];
        const output = replies
          .map((r, i) => `${i + 1}. ${r}`)
          .join('\n');

        return { success: true, output };
      },
    },
  ],
};
