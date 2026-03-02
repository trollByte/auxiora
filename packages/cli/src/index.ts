#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createVaultCommand } from './commands/vault.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createAuditCommand } from './commands/audit.js';
import { createPathsCommand } from './commands/paths.js';
import { createStartCommand } from './commands/start.js';
import { createAuthCommand } from './commands/auth.js';
import { createDaemonCommand } from './commands/daemon.js';
import { createInitCommand } from './commands/init.js';
import { createPersonalityCommand } from './commands/personality.js';
import { createModelsCommand } from './commands/models.js';
import { createMemoryCommand } from './commands/memory.js';
import { createOrchestrationCommand } from './commands/orchestration.js';
import { createPluginCommand } from './commands/plugin.js';
// [P12] Trust / Autonomy
import { createTrustCommand } from './commands/trust.js';
// [P6] Desktop
import { createDesktopCommand } from './commands/desktop.js';
// [P7] Cloud
import { createCloudCommand } from './commands/cloud.js';
// [P13] Connectors
import { createConnectCommand } from './commands/connect.js';
// [P14] Team / Workflows
import { createTeamCommand } from './commands/team.js';
import { createWorkflowCommand } from './commands/workflow.js';
// [P15] Ambient
import { createAmbientCommand } from './commands/ambient.js';
import { createUpdateCommand } from './commands/update.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('auxiora')
  .description('Secure AI Assistant Platform')
  .version(cliPkg.version);

// Core commands
program.addCommand(createInitCommand());
program.addCommand(createStartCommand());
program.addCommand(createVaultCommand());
program.addCommand(createAuthCommand());
program.addCommand(createDaemonCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createAuditCommand());
program.addCommand(createPathsCommand());
program.addCommand(createPersonalityCommand());
program.addCommand(createModelsCommand());
program.addCommand(createMemoryCommand());
program.addCommand(createOrchestrationCommand());
program.addCommand(createPluginCommand());
// [P12] Trust / Autonomy
program.addCommand(createTrustCommand());
// [P6] Desktop
program.addCommand(createDesktopCommand());
// [P7] Cloud
program.addCommand(createCloudCommand());
// [P13] Connectors
program.addCommand(createConnectCommand());
// [P14] Team / Workflows
program.addCommand(createTeamCommand());
program.addCommand(createWorkflowCommand());
// [P15] Ambient
program.addCommand(createAmbientCommand());
// Self-update
program.addCommand(createUpdateCommand());

program.parse();
