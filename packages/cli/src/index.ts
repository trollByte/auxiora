#!/usr/bin/env node

import { Command } from 'commander';
import { createVaultCommand } from './commands/vault.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createAuditCommand } from './commands/audit.js';
import { createPathsCommand } from './commands/paths.js';
import { createStartCommand } from './commands/start.js';

const program = new Command();

program
  .name('auxiora')
  .description('Secure AI Assistant Platform')
  .version('1.0.0');

// Core commands
program.addCommand(createStartCommand());
program.addCommand(createVaultCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createAuditCommand());
program.addCommand(createPathsCommand());

program.parse();
