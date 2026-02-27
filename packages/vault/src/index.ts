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
export { CloudVault, type EncryptedEnvelope } from './cloud-vault.js';
export { KeyManager, type ExportedKey } from './key-management.js';
export { EjectManager, type EjectableData } from './eject.js';
export { SealManager, getMachineFingerprint, type SealFile, type SealOptions } from './seal.js';
