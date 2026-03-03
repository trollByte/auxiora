import os from 'node:os';
import { execFile } from 'node:child_process';
import { readFile, statfs } from 'node:fs/promises';
import type { ResourceSnapshot, GpuInfo, MachineClass, MachineProfile } from './types.js';

function execFilePromise(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function bytesToMB(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

export class ResourceProbe {
  private gpuCache: { result: GpuInfo | null; timestamp: number } | null = null;
  private gpuCacheTtlMs = 60_000;

  async probe(): Promise<ResourceSnapshot> {
    const [memory, swap, gpu, disk] = await Promise.all([
      this.readMemory(),
      this.readSwap(),
      this.readGpu(),
      this.readDisk(),
    ]);

    const cpus = os.cpus();
    const [loadAvg1m, loadAvg5m] = os.loadavg();
    const cores = cpus.length;
    const utilization = Math.min(1, Math.max(0, loadAvg1m / cores));

    return {
      cpu: {
        cores,
        model: cpus[0]?.model ?? 'unknown',
        loadAvg1m,
        loadAvg5m,
        utilization,
      },
      memory,
      swap,
      gpu,
      disk,
      timestamp: Date.now(),
    };
  }

  classify(snapshot: ResourceSnapshot): MachineProfile {
    const cores = snapshot.cpu.cores;
    const ramMB = snapshot.memory.totalMB;
    const hasGpu = snapshot.gpu !== null;

    let machineClass: MachineClass;
    let recommendedMaxAgents: number;

    if (cores <= 2 || ramMB <= 2048) {
      machineClass = 'minimal';
      recommendedMaxAgents = 1;
    } else if (cores <= 4 && ramMB <= 8192) {
      machineClass = 'light';
      recommendedMaxAgents = 2;
    } else if (cores <= 8 && ramMB <= 16384) {
      machineClass = 'standard';
      recommendedMaxAgents = 3;
    } else if (cores <= 16 && ramMB <= 65536) {
      machineClass = 'workstation';
      recommendedMaxAgents = 5;
    } else {
      machineClass = 'server';
      recommendedMaxAgents = 8;
    }

    return {
      machineClass,
      hasGpu,
      recommendedMaxAgents,
      cpuCeiling: 0.8,
      ramCeiling: 0.8,
    };
  }

  safeSlots(snapshot: ResourceSnapshot, profile: MachineProfile): number {
    const memSlots = Math.floor(snapshot.memory.availableMB / 512);
    const cpuSlots = Math.floor((1 - snapshot.cpu.utilization) * snapshot.cpu.cores);
    return Math.max(1, Math.min(profile.recommendedMaxAgents, memSlots, cpuSlots));
  }

  private async readMemory(): Promise<ResourceSnapshot['memory']> {
    const totalMB = bytesToMB(os.totalmem());
    const freeMB = bytesToMB(os.freemem());
    let availableMB = freeMB;

    if (os.platform() === 'linux') {
      try {
        const meminfo = await readFile('/proc/meminfo', 'utf-8');
        const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
        if (match) {
          availableMB = Math.round(Number(match[1]) / 1024);
        }
      } catch {
        // fall back to freemem
      }
    }

    const usedPercent = totalMB > 0 ? Math.round(((totalMB - availableMB) / totalMB) * 100) : 0;

    return { totalMB, freeMB, availableMB, usedPercent };
  }

  private async readSwap(): Promise<ResourceSnapshot['swap']> {
    const platform = os.platform();

    if (platform === 'linux') {
      try {
        const meminfo = await readFile('/proc/meminfo', 'utf-8');
        const totalMatch = meminfo.match(/SwapTotal:\s+(\d+)\s+kB/);
        const freeMatch = meminfo.match(/SwapFree:\s+(\d+)\s+kB/);
        if (totalMatch && freeMatch) {
          const totalMB = Math.round(Number(totalMatch[1]) / 1024);
          const freeMB = Math.round(Number(freeMatch[1]) / 1024);
          const usedMB = totalMB - freeMB;
          const usedPercent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;
          return { totalMB, usedMB, usedPercent };
        }
      } catch {
        // fall through
      }
    }

    if (platform === 'darwin') {
      try {
        const output = await execFilePromise('sysctl', ['vm.swapusage']);
        // Format: "vm.swapusage: total = 2048.00M  used = 512.00M  free = 1536.00M  ..."
        const totalMatch = output.match(/total\s*=\s*([\d.]+)M/);
        const usedMatch = output.match(/used\s*=\s*([\d.]+)M/);
        if (totalMatch && usedMatch) {
          const totalMB = Math.round(Number(totalMatch[1]));
          const usedMB = Math.round(Number(usedMatch[1]));
          const usedPercent = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;
          return { totalMB, usedMB, usedPercent };
        }
      } catch {
        // fall through
      }
    }

    return { totalMB: 0, usedMB: 0, usedPercent: 0 };
  }

  async readGpu(): Promise<GpuInfo | null> {
    const now = Date.now();
    if (this.gpuCache && now - this.gpuCache.timestamp < this.gpuCacheTtlMs) {
      return this.gpuCache.result;
    }

    let result: GpuInfo | null = null;

    // Try NVIDIA first
    try {
      const output = await execFilePromise('nvidia-smi', [
        '--query-gpu=name,memory.total,memory.used,utilization.gpu',
        '--format=csv,noheader,nounits',
      ]);
      const parts = output.trim().split(',').map((s) => s.trim());
      if (parts.length >= 4) {
        result = {
          name: parts[0],
          memoryTotalMB: Number(parts[1]),
          memoryUsedMB: Number(parts[2]),
          utilizationPercent: Number(parts[3]),
        };
      }
    } catch {
      // Try AMD ROCm
      try {
        const output = await execFilePromise('rocm-smi', ['--showmeminfo', 'vram', '--showuse']);
        // Parse ROCm output — best effort
        const usedMatch = output.match(/Used\s*:\s*(\d+)/);
        const totalMatch = output.match(/Total\s*:\s*(\d+)/);
        const utilMatch = output.match(/GPU use\s*\(%\)\s*:\s*(\d+)/i);
        if (totalMatch) {
          result = {
            name: 'AMD GPU',
            memoryTotalMB: Math.round(Number(totalMatch[1]) / (1024 * 1024)),
            memoryUsedMB: usedMatch ? Math.round(Number(usedMatch[1]) / (1024 * 1024)) : 0,
            utilizationPercent: utilMatch ? Number(utilMatch[1]) : 0,
          };
        }
      } catch {
        // No GPU available
      }
    }

    this.gpuCache = { result, timestamp: now };
    return result;
  }

  private async readDisk(): Promise<ResourceSnapshot['disk']> {
    try {
      const stats = await statfs(process.cwd());
      const blockSize = stats.bsize;
      const totalMB = bytesToMB(stats.blocks * blockSize);
      const freeMB = bytesToMB(stats.bavail * blockSize);
      const usedPercent = totalMB > 0 ? Math.round(((totalMB - freeMB) / totalMB) * 100) : 0;
      return { totalMB, freeMB, usedPercent };
    } catch {
      return null;
    }
  }
}
