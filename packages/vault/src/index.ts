export { Vault, VaultError, type VaultOptions } from './vault.js';
export {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  generateIv,
  zeroBuffer,
} from './crypto.js';
export { readVaultFile, writeVaultFile, deleteVaultFile, getVaultPath, vaultExists } from './storage.js';
