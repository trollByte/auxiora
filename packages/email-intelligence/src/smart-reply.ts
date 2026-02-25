import { getLogger } from '@auxiora/logger';
import type { EmailMessage, SmartReplyDraft } from './types.js';

const logger = getLogger('email-intelligence:smart-reply');

export class SmartReplyGenerator {
  generateQuickReplies(email: EmailMessage): SmartReplyDraft[] {
    logger.debug('Generating quick replies', { emailId: email.id });

    const bodyLower = (email.body ?? email.bodyPreview).toLowerCase();
    const isMeetingInvite = this.isMeetingInvite(email);
    const question = this.extractQuestion(email);

    const replies: SmartReplyDraft[] = [];

    // 1. Brief acknowledgment
    if (isMeetingInvite) {
      replies.push({
        emailId: email.id,
        replyBody: 'Thanks for the invite. I\'ll be there.',
        tone: 'brief',
        confidence: 0.7,
      });
    } else if (question) {
      replies.push({
        emailId: email.id,
        replyBody: 'Got it, will review and get back to you shortly.',
        tone: 'brief',
        confidence: 0.6,
      });
    } else {
      replies.push({
        emailId: email.id,
        replyBody: 'Thanks, received.',
        tone: 'brief',
        confidence: 0.7,
      });
    }

    // 2. Detailed response template
    if (isMeetingInvite) {
      replies.push({
        emailId: email.id,
        replyBody: `Thank you for the meeting invitation regarding "${email.subject}". I have reviewed the details and will attend as scheduled. Please let me know if any preparation is needed on my end.`,
        tone: 'formal',
        confidence: 0.6,
      });
    } else if (question) {
      replies.push({
        emailId: email.id,
        replyBody: `Thank you for your email regarding "${email.subject}". Regarding your question: "${question}" - I will look into this and provide a detailed response.`,
        tone: 'formal',
        confidence: 0.5,
      });
    } else if (this.isRequest(bodyLower)) {
      replies.push({
        emailId: email.id,
        replyBody: `Thank you for your email regarding "${email.subject}". I have noted the request and will take the necessary action. I will follow up once completed.`,
        tone: 'formal',
        confidence: 0.5,
      });
    } else {
      replies.push({
        emailId: email.id,
        replyBody: `Thank you for your email regarding "${email.subject}". I have reviewed the information and will follow up if needed.`,
        tone: 'formal',
        confidence: 0.5,
      });
    }

    // 3. Decline/defer
    replies.push({
      emailId: email.id,
      replyBody: 'Thanks for reaching out. I\'ll get back to you on this.',
      tone: 'formal',
      confidence: 0.6,
    });

    return replies;
  }

  private isMeetingInvite(email: EmailMessage): boolean {
    const subjectLower = email.subject.toLowerCase();
    const bodyLower = (email.body ?? email.bodyPreview).toLowerCase();
    const meetingKeywords = ['meeting', 'invite', 'invitation', 'calendar', 'schedule', 'call', 'sync'];
    return meetingKeywords.some(kw => subjectLower.includes(kw) || bodyLower.includes(kw));
  }

  private extractQuestion(email: EmailMessage): string | null {
    const body = email.body ?? email.bodyPreview;
    const sentences = body.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);
    const questionSentence = sentences.find(s => s.includes('?'));
    return questionSentence ? questionSentence.replace(/\?$/, '').trim() + '?' : null;
  }

  private isRequest(bodyLower: string): boolean {
    const requestKeywords = ['please', 'could you', 'can you', 'would you', 'need you to', 'kindly'];
    return requestKeywords.some(kw => bodyLower.includes(kw));
  }
}
