#!/usr/bin/env node

import { Command } from 'commander';
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

const program = new Command();

program
  .name('auxiora')
  .description('Secure AI Assistant Platform')
  .version('1.0.0');

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

program.parse();
