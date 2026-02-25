import { Command } from 'commander';

export function createTeamCommand(): Command {
  const cmd = new Command('team').description('Manage team users and roles');

  cmd
    .command('create <name>')
    .description('Create a new team user')
    .option('-r, --role <role>', 'User role (admin, member, viewer)', 'member')
    .option('-c, --channel <mapping>', 'Channel mapping in format type:senderId')
    .action(async (name: string, opts: { role: string; channel?: string }) => {
      const { UserManager } = await import('@auxiora/social');

      const manager = new UserManager();
      const channels = opts.channel
        ? [{ channelType: opts.channel.split(':')[0], senderId: opts.channel.split(':').slice(1).join(':') }]
        : [];

      const user = await manager.createUser(name, opts.role, { channels });
      console.log(`Created user: ${user.name} (${user.id})`);
      console.log(`  Role: ${user.role}`);
      console.log(`  Memory partition: ${user.memoryPartition}`);
      if (channels.length > 0) {
        console.log(`  Channel: ${channels[0].channelType}:${channels[0].senderId}`);
      }
    });

  cmd
    .command('add <userId> <channelType> <senderId>')
    .description('Add a channel mapping to a user')
    .action(async (userId: string, channelType: string, senderId: string) => {
      const { UserManager, UserResolver } = await import('@auxiora/social');

      const manager = new UserManager();
      const resolver = new UserResolver(manager);
      const mapped = await resolver.mapChannel(userId, channelType, senderId);

      if (mapped) {
        console.log(`Mapped ${channelType}:${senderId} to user ${userId}`);
      } else {
        console.error(`User not found: ${userId}`);
        process.exit(1);
      }
    });

  cmd
    .command('list')
    .description('List all team users')
    .action(async () => {
      const { UserManager } = await import('@auxiora/social');

      const manager = new UserManager();
      const users = await manager.listUsers();

      if (users.length === 0) {
        console.log('No team users configured.');
        return;
      }

      console.log('Team Users:');
      for (const user of users) {
        const channels = user.channels.map(c => `${c.channelType}:${c.senderId}`).join(', ') || 'none';
        const lastActive = new Date(user.lastActiveAt).toLocaleDateString();
        console.log(`  ${user.name} (${user.id})`);
        console.log(`    Role: ${user.role} | Channels: ${channels} | Last active: ${lastActive}`);
      }
    });

  cmd
    .command('remove <userId>')
    .description('Remove a team user')
    .action(async (userId: string) => {
      const { UserManager } = await import('@auxiora/social');

      const manager = new UserManager();
      const deleted = await manager.deleteUser(userId);

      if (deleted) {
        console.log(`Removed user: ${userId}`);
      } else {
        console.error(`User not found: ${userId}`);
        process.exit(1);
      }
    });

  cmd
    .command('roles')
    .description('List available roles')
    .action(async () => {
      const { UserManager, RoleManager } = await import('@auxiora/social');

      const manager = new UserManager();
      const roleManager = new RoleManager(manager);
      const roles = await roleManager.listRoles();

      console.log('Available Roles:');
      for (const role of roles) {
        const builtIn = role.builtIn ? ' (built-in)' : '';
        console.log(`  ${role.name}${builtIn} [${role.id}]`);
        console.log(`    Permissions: ${role.permissions.join(', ')}`);
      }
    });

  return cmd;
}
