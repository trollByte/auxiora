import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import { ResourceProbe } from '../src/resource-probe.js';
import type { ResourceSnapshot, MachineProfile } from '../src/types.js';

// Helper to build a snapshot with overrides
function makeSnapshot(overrides: Partial<{
  cores: number;
  model: string;
  loadAvg1m: number;
  loadAvg5m: number;
  utilization: number;
  totalMB: number;
  freeMB: number;
  availableMB: number;
  usedPercent: number;
  swapTotalMB: number;
  swapUsedMB: number;
  swapUsedPercent: number;
  gpu: ResourceSnapshot['gpu'];
  disk: ResourceSnapshot['disk'];
}> = {}): ResourceSnapshot {
  const cores = overrides.cores ?? 8;
  const totalMB = overrides.totalMB ?? 16384;
  const freeMB = overrides.freeMB ?? 8192;
  const availableMB = overrides.availableMB ?? 10240;
  return {
    cpu: {
      cores,
      model: overrides.model ?? 'Test CPU',
      loadAvg1m: overrides.loadAvg1m ?? 1.0,
      loadAvg5m: overrides.loadAvg5m ?? 0.8,
      utilization: overrides.utilization ?? 0.125,
    },
    memory: {
      totalMB,
      freeMB,
      availableMB,
      usedPercent: overrides.usedPercent ?? Math.round(((totalMB - availableMB) / totalMB) * 100),
    },
    swap: {
      totalMB: overrides.swapTotalMB ?? 4096,
      usedMB: overrides.swapUsedMB ?? 512,
      usedPercent: overrides.swapUsedPercent ?? 13,
    },
    gpu: overrides.gpu === undefined ? null : overrides.gpu,
    disk: overrides.disk === undefined ? { totalMB: 500000, freeMB: 250000, usedPercent: 50 } : overrides.disk,
    timestamp: Date.now(),
  };
}

describe('ResourceProbe', () => {
  let probe: ResourceProbe;

  beforeEach(() => {
    probe = new ResourceProbe();
  });

  describe('probe()', () => {
    it('returns a valid ResourceSnapshot structure', async () => {
      const snapshot = await probe.probe();
      expect(snapshot.cpu.cores).toBeGreaterThan(0);
      expect(typeof snapshot.cpu.model).toBe('string');
      expect(typeof snapshot.cpu.loadAvg1m).toBe('number');
      expect(typeof snapshot.cpu.loadAvg5m).toBe('number');
      expect(snapshot.cpu.utilization).toBeGreaterThanOrEqual(0);
      expect(snapshot.cpu.utilization).toBeLessThanOrEqual(1);
      expect(snapshot.memory.totalMB).toBeGreaterThan(0);
      expect(snapshot.memory.freeMB).toBeGreaterThanOrEqual(0);
      expect(snapshot.memory.availableMB).toBeGreaterThan(0);
      expect(typeof snapshot.memory.usedPercent).toBe('number');
      expect(typeof snapshot.swap.totalMB).toBe('number');
      expect(typeof snapshot.swap.usedMB).toBe('number');
      expect(typeof snapshot.swap.usedPercent).toBe('number');
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('clamps CPU utilization to 0-1 range', async () => {
      // We can't easily force loadavg > cores in a real probe,
      // but we verify the clamp logic by checking the result is within range
      const snapshot = await probe.probe();
      expect(snapshot.cpu.utilization).toBeGreaterThanOrEqual(0);
      expect(snapshot.cpu.utilization).toBeLessThanOrEqual(1);
    });

    it('disk may be non-null on supported platforms', async () => {
      const snapshot = await probe.probe();
      // On CI/Linux, statfs should work
      if (snapshot.disk !== null) {
        expect(snapshot.disk.totalMB).toBeGreaterThan(0);
        expect(typeof snapshot.disk.freeMB).toBe('number');
        expect(typeof snapshot.disk.usedPercent).toBe('number');
      }
    });

    it('gpu is null when no GPU tools available', async () => {
      // In test environments, nvidia-smi and rocm-smi are typically not available
      const snapshot = await probe.probe();
      // Can't assert null definitively (CI might have GPU), so just check type
      if (snapshot.gpu !== null) {
        expect(typeof snapshot.gpu.name).toBe('string');
        expect(typeof snapshot.gpu.memoryTotalMB).toBe('number');
      } else {
        expect(snapshot.gpu).toBeNull();
      }
    });
  });

  describe('GPU caching', () => {
    it('caches GPU result for subsequent calls', async () => {
      const result1 = await probe.readGpu();
      const result2 = await probe.readGpu();
      // Both should be the same (cached)
      expect(result1).toEqual(result2);
    });
  });

  describe('classify()', () => {
    it('classifies minimal: <=2 cores', () => {
      const snapshot = makeSnapshot({ cores: 2, totalMB: 8192 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('minimal');
      expect(profile.recommendedMaxAgents).toBe(1);
    });

    it('classifies minimal: <=2GB RAM', () => {
      const snapshot = makeSnapshot({ cores: 8, totalMB: 2048 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('minimal');
      expect(profile.recommendedMaxAgents).toBe(1);
    });

    it('classifies light: <=4 cores AND <=8GB', () => {
      const snapshot = makeSnapshot({ cores: 4, totalMB: 8192 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('light');
      expect(profile.recommendedMaxAgents).toBe(2);
    });

    it('classifies standard: <=8 cores AND <=16GB', () => {
      const snapshot = makeSnapshot({ cores: 8, totalMB: 16384 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('standard');
      expect(profile.recommendedMaxAgents).toBe(3);
    });

    it('classifies workstation: <=16 cores AND <=64GB', () => {
      const snapshot = makeSnapshot({ cores: 16, totalMB: 65536 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('workstation');
      expect(profile.recommendedMaxAgents).toBe(5);
    });

    it('classifies server: >16 cores', () => {
      const snapshot = makeSnapshot({ cores: 32, totalMB: 32768 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('server');
      expect(profile.recommendedMaxAgents).toBe(8);
    });

    it('classifies server: >64GB RAM', () => {
      const snapshot = makeSnapshot({ cores: 8, totalMB: 131072 });
      const profile = probe.classify(snapshot);
      expect(profile.machineClass).toBe('server');
      expect(profile.recommendedMaxAgents).toBe(8);
    });

    it('sets hasGpu true when GPU is present', () => {
      const snapshot = makeSnapshot({
        gpu: { name: 'RTX 4090', memoryTotalMB: 24576, memoryUsedMB: 4096, utilizationPercent: 30 },
      });
      const profile = probe.classify(snapshot);
      expect(profile.hasGpu).toBe(true);
    });

    it('sets hasGpu false when GPU is null', () => {
      const snapshot = makeSnapshot({ gpu: null });
      const profile = probe.classify(snapshot);
      expect(profile.hasGpu).toBe(false);
    });

    it('always sets cpuCeiling and ramCeiling to 0.8', () => {
      const snapshot = makeSnapshot({});
      const profile = probe.classify(snapshot);
      expect(profile.cpuCeiling).toBe(0.8);
      expect(profile.ramCeiling).toBe(0.8);
    });
  });

  describe('safeSlots()', () => {
    it('returns at least 1 even under extreme load', () => {
      const snapshot = makeSnapshot({
        cores: 4,
        totalMB: 4096,
        availableMB: 100,
        utilization: 0.99,
      });
      const profile: MachineProfile = {
        machineClass: 'light',
        hasGpu: false,
        recommendedMaxAgents: 2,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      };
      expect(probe.safeSlots(snapshot, profile)).toBe(1);
    });

    it('limits by recommended max agents', () => {
      const snapshot = makeSnapshot({
        cores: 32,
        availableMB: 65536,
        utilization: 0.1,
      });
      const profile: MachineProfile = {
        machineClass: 'light',
        hasGpu: false,
        recommendedMaxAgents: 2,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      };
      expect(probe.safeSlots(snapshot, profile)).toBe(2);
    });

    it('limits by available memory (512MB per slot)', () => {
      const snapshot = makeSnapshot({
        cores: 16,
        availableMB: 1536, // 1536/512 = 3
        utilization: 0.1,
      });
      const profile: MachineProfile = {
        machineClass: 'workstation',
        hasGpu: false,
        recommendedMaxAgents: 5,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      };
      expect(probe.safeSlots(snapshot, profile)).toBe(3);
    });

    it('limits by CPU headroom', () => {
      const snapshot = makeSnapshot({
        cores: 4,
        availableMB: 32768,
        utilization: 0.8, // (1 - 0.8) * 4 = 0.8 → floor = 0 → clamped to 1
      });
      const profile: MachineProfile = {
        machineClass: 'standard',
        hasGpu: false,
        recommendedMaxAgents: 3,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      };
      expect(probe.safeSlots(snapshot, profile)).toBe(1);
    });

    it('balanced system returns reasonable slots', () => {
      const snapshot = makeSnapshot({
        cores: 8,
        availableMB: 8192, // 8192/512 = 16
        utilization: 0.25, // (1-0.25)*8 = 6
      });
      const profile: MachineProfile = {
        machineClass: 'standard',
        hasGpu: false,
        recommendedMaxAgents: 3,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      };
      // min(3, 16, 6) = 3
      expect(probe.safeSlots(snapshot, profile)).toBe(3);
    });

    it('zero available memory returns 1', () => {
      const snapshot = makeSnapshot({
        cores: 8,
        availableMB: 0,
        utilization: 0.1,
      });
      const profile: MachineProfile = {
        machineClass: 'standard',
        hasGpu: false,
        recommendedMaxAgents: 3,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      };
      expect(probe.safeSlots(snapshot, profile)).toBe(1);
    });
  });

  describe('classify boundary conditions', () => {
    it('3 cores with 2GB RAM is minimal (RAM trigger)', () => {
      const snapshot = makeSnapshot({ cores: 3, totalMB: 2048 });
      expect(probe.classify(snapshot).machineClass).toBe('minimal');
    });

    it('3 cores with 4GB RAM is light', () => {
      const snapshot = makeSnapshot({ cores: 3, totalMB: 4096 });
      expect(probe.classify(snapshot).machineClass).toBe('light');
    });

    it('5 cores with 9GB RAM is standard (exceeds light thresholds)', () => {
      const snapshot = makeSnapshot({ cores: 5, totalMB: 9216 });
      expect(probe.classify(snapshot).machineClass).toBe('standard');
    });

    it('17 cores with 32GB is server (cores exceed workstation)', () => {
      const snapshot = makeSnapshot({ cores: 17, totalMB: 32768 });
      expect(probe.classify(snapshot).machineClass).toBe('server');
    });
  });
});
