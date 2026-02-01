export { Vault, VaultError } from './vault.js';
export {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  generateIv,
  zeroBuffer,
} from './crypto.js';
export { readVaultFile, writeVaultFile, deleteVaultFile } from './storage.js';
