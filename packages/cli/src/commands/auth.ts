import { Command } from 'commander';
import { password as passwordPrompt } from '@inquirer/prompts';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import * as crypto from 'node:crypto';
import { loadConfig, saveConfig } from '@auxiora/config';
import { audit } from '@auxiora/audit';

export function createAuthCommand(): Command {
  const authCmd = new Command('auth').description('Manage gateway authentication');

  authCmd
    .command('set-password')
    .description('Set the gateway password for webchat authentication')
    .action(async () => {
      const config = await loadConfig();

      const password = await passwordPrompt({
        message: 'Enter new gateway password:',
      });

      const confirmPassword = await passwordPrompt({
        message: 'Confirm gateway password:',
      });

      if (password !== confirmPassword) {
        console.error('Passwords do not match');
        process.exit(1);
      }

      if (password.length < 8) {
        console.error('Password must be at least 8 characters');
        process.exit(1);
      }

      // Hash the password with Argon2id
      const hash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 1,
      });

      config.auth.mode = 'password';
      config.auth.passwordHash = hash;

      await saveConfig(config);
      await audit('auth.password_set', {});

      console.log('Gateway password set successfully');
      console.log('Authentication mode set to: password');
    });

  authCmd
    .command('setup-jwt')
    .description('Configure JWT authentication for the gateway')
    .option('-s, --secret <secret>', 'JWT secret (min 32 chars, auto-generated if not provided)')
    .action(async (options: { secret?: string }) => {
      const config = await loadConfig();

      let secret = options.secret;
      if (!secret) {
        // Generate a secure random secret
        secret = crypto.randomBytes(32).toString('base64url');
        console.log('Generated JWT secret (save this securely):');
        console.log(`  ${secret}\n`);
      } else if (secret.length < 32) {
        console.error('JWT secret must be at least 32 characters');
        process.exit(1);
      }

      config.auth.mode = 'jwt';
      config.auth.jwtSecret = secret;

      await saveConfig(config);
      await audit('auth.jwt_configured', {});

      console.log('JWT authentication configured successfully');
      console.log('Authentication mode set to: jwt');
      console.log('\nGenerate tokens with: auxiora auth generate-token');
    });

  authCmd
    .command('generate-token')
    .description('Generate a JWT token for authentication')
    .option('-s, --subject <subject>', 'Token subject/user identifier', 'user')
    .option('-e, --expires <duration>', 'Token expiration (e.g., 7d, 24h)', '7d')
    .action(async (options: { subject: string; expires: string }) => {
      const config = await loadConfig();

      if (config.auth.mode !== 'jwt') {
        console.error('JWT mode not configured. Run: auxiora auth setup-jwt');
        process.exit(1);
      }

      if (!config.auth.jwtSecret) {
        console.error('JWT secret not set. Run: auxiora auth setup-jwt');
        process.exit(1);
      }

      const token = jwt.sign(
        { sub: options.subject },
        config.auth.jwtSecret,
        { expiresIn: options.expires as jwt.SignOptions['expiresIn'] }
      );

      await audit('auth.token_generated', { subject: options.subject });

      console.log('Generated JWT token:\n');
      console.log(token);
      console.log(`\nSubject: ${options.subject}`);
      console.log(`Expires: ${options.expires}`);
    });

  authCmd
    .command('disable')
    .description('Disable authentication (allow anonymous access)')
    .action(async () => {
      const config = await loadConfig();

      config.auth.mode = 'none';

      await saveConfig(config);
      await audit('auth.disabled', {});

      console.log('Authentication disabled');
      console.log('Warning: Anyone can access the gateway without authentication');
    });

  authCmd
    .command('status')
    .description('Show current authentication configuration')
    .action(async () => {
      const config = await loadConfig();

      console.log('\nAuthentication Status\n');
      console.log(`Mode: ${config.auth.mode}`);

      switch (config.auth.mode) {
        case 'none':
          console.log('Status: No authentication required (open access)');
          break;
        case 'password':
          console.log(`Status: Password authentication ${config.auth.passwordHash ? 'configured' : 'NOT configured'}`);
          if (!config.auth.passwordHash) {
            console.log('\nRun: auxiora auth set-password');
          }
          break;
        case 'jwt':
          console.log(`Status: JWT authentication ${config.auth.jwtSecret ? 'configured' : 'NOT configured'}`);
          console.log(`Token expiry: ${config.auth.jwtExpiresIn}`);
          if (!config.auth.jwtSecret) {
            console.log('\nRun: auxiora auth setup-jwt');
          }
          break;
      }
      console.log('');
    });

  return authCmd;
}
