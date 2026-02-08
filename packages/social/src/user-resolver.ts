import { getLogger } from '@auxiora/logger';
import type { UserIdentity } from './types.js';
import type { UserManager } from './user-manager.js';

const logger = getLogger('social:user-resolver');

/**
 * Resolves channel senders to Auxiora user identities.
 * Maps channel IDs (Discord, Telegram, Slack, etc.) to users.
 */
export class UserResolver {
  constructor(private userManager: UserManager) {}

  /**
   * Resolve a channel sender to a user identity.
   * Returns undefined if no user is mapped to this sender.
   */
  async resolveUser(
    channelType: string,
    senderId: string,
  ): Promise<UserIdentity | undefined> {
    const user = await this.userManager.authenticateUser(channelType, senderId);

    if (user) {
      logger.debug('Resolved user', { channelType, senderId, userId: user.id });
    }

    return user;
  }

  /**
   * Resolve or create a default user for a channel sender.
   * Creates a new viewer user if none is mapped.
   */
  async resolveOrCreate(
    channelType: string,
    senderId: string,
    defaultName?: string,
  ): Promise<UserIdentity> {
    const existing = await this.resolveUser(channelType, senderId);
    if (existing) return existing;

    const name = defaultName ?? `${channelType}:${senderId}`;
    const user = await this.userManager.createUser(name, 'viewer', {
      channels: [{ channelType, senderId }],
    });

    logger.debug('Auto-created user for channel sender', {
      channelType,
      senderId,
      userId: user.id,
    });

    return user;
  }

  /**
   * Map a channel sender to an existing user.
   */
  async mapChannel(
    userId: string,
    channelType: string,
    senderId: string,
  ): Promise<boolean> {
    const user = await this.userManager.getUser(userId);
    if (!user) return false;

    const existing = user.channels.find(
      c => c.channelType === channelType && c.senderId === senderId,
    );
    if (existing) return true;

    const channels = [...user.channels, { channelType, senderId }];
    const updated = await this.userManager.updateUser(userId, { channels });
    return updated !== undefined;
  }

  /**
   * Remove a channel mapping from a user.
   */
  async unmapChannel(
    userId: string,
    channelType: string,
    senderId: string,
  ): Promise<boolean> {
    const user = await this.userManager.getUser(userId);
    if (!user) return false;

    const channels = user.channels.filter(
      c => !(c.channelType === channelType && c.senderId === senderId),
    );

    if (channels.length === user.channels.length) return false;

    const updated = await this.userManager.updateUser(userId, { channels });
    return updated !== undefined;
  }
}
