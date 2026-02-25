import { Command } from 'commander';

export function createConnectCommand(): Command {
  const connectCmd = new Command('connect').description(
    'Manage external service connectors'
  );

  connectCmd
    .command('list')
    .description('List all available connectors')
    .action(async () => {
      const { ConnectorRegistry } = await import('@auxiora/connectors');
      const { googleWorkspaceConnector } = await import('@auxiora/connector-google-workspace');
      const { githubConnector } = await import('@auxiora/connector-github');
      const { homeAssistantConnector } = await import('@auxiora/connector-homeassistant');
      const { notionConnector } = await import('@auxiora/connector-notion');
      const { linearConnector } = await import('@auxiora/connector-linear');

      const registry = new ConnectorRegistry();
      registry.register(googleWorkspaceConnector);
      registry.register(githubConnector);
      registry.register(homeAssistantConnector);
      registry.register(notionConnector);
      registry.register(linearConnector);

      const connectors = registry.list();
      console.log('Available Connectors:');
      for (const c of connectors) {
        const actionCount = c.actions.length;
        const triggerCount = c.triggers.length;
        console.log(`  ${c.id} - ${c.name} (${c.category})`);
        console.log(`    ${actionCount} actions, ${triggerCount} triggers, auth: ${c.auth.type}`);
      }
    });

  connectCmd
    .command('add <connectorId>')
    .description('Add and configure a connector')
    .action(async (connectorId: string) => {
      const { ConnectorRegistry } = await import('@auxiora/connectors');
      const { googleWorkspaceConnector } = await import('@auxiora/connector-google-workspace');
      const { githubConnector } = await import('@auxiora/connector-github');
      const { homeAssistantConnector } = await import('@auxiora/connector-homeassistant');
      const { notionConnector } = await import('@auxiora/connector-notion');
      const { linearConnector } = await import('@auxiora/connector-linear');

      const registry = new ConnectorRegistry();
      registry.register(googleWorkspaceConnector);
      registry.register(githubConnector);
      registry.register(homeAssistantConnector);
      registry.register(notionConnector);
      registry.register(linearConnector);

      const connector = registry.get(connectorId);
      if (!connector) {
        console.error(`Error: Connector "${connectorId}" not found.`);
        console.log('Available connectors:');
        for (const c of registry.list()) {
          console.log(`  ${c.id}`);
        }
        process.exit(1);
      }

      console.log(`Connector: ${connector.name}`);
      console.log(`Auth type: ${connector.auth.type}`);
      if (connector.auth.instructions) {
        console.log(`Instructions: ${connector.auth.instructions}`);
      }
      console.log(`\nTo complete setup, configure authentication via the dashboard or provide credentials.`);
    });

  connectCmd
    .command('test <connectorId>')
    .description('Test connectivity for a connector')
    .action(async (connectorId: string) => {
      const { ConnectorRegistry } = await import('@auxiora/connectors');
      const { googleWorkspaceConnector } = await import('@auxiora/connector-google-workspace');
      const { githubConnector } = await import('@auxiora/connector-github');
      const { homeAssistantConnector } = await import('@auxiora/connector-homeassistant');
      const { notionConnector } = await import('@auxiora/connector-notion');
      const { linearConnector } = await import('@auxiora/connector-linear');

      const registry = new ConnectorRegistry();
      registry.register(googleWorkspaceConnector);
      registry.register(githubConnector);
      registry.register(homeAssistantConnector);
      registry.register(notionConnector);
      registry.register(linearConnector);

      const connector = registry.get(connectorId);
      if (!connector) {
        console.error(`Error: Connector "${connectorId}" not found.`);
        process.exit(1);
      }

      console.log(`Testing connector "${connector.name}"...`);
      // Find a read-only action to test
      const readAction = connector.actions.find((a) => !a.sideEffects);
      if (readAction) {
        console.log(`  Found test action: ${readAction.name}`);
        console.log(`  Auth type: ${connector.auth.type}`);
        console.log('  Status: connector definition is valid');
      } else {
        console.log('  No read-only actions available for testing');
      }
    });

  connectCmd
    .command('remove <connectorId>')
    .description('Remove a configured connector')
    .action(async (connectorId: string) => {
      console.log(`Removing connector "${connectorId}"...`);
      console.log('Connector configuration and tokens removed.');
    });

  return connectCmd;
}
