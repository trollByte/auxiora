import type { InstallMethod, UpdateStrategy } from '../types.js';
import { NpmStrategy } from './npm.js';
import { GitStrategy } from './git.js';
import { DockerStrategy } from './docker.js';
import { AptStrategy } from './apt.js';
import { BrewStrategy } from './brew.js';
import { TarballStrategy } from './tarball.js';
import { K8sStrategy } from './k8s.js';

export function createStrategyMap(): Map<InstallMethod, UpdateStrategy> {
  const strategies: UpdateStrategy[] = [
    new NpmStrategy(),
    new GitStrategy(),
    new DockerStrategy(),
    new AptStrategy(),
    new BrewStrategy(),
    new TarballStrategy(),
    new K8sStrategy(),
  ];

  const map = new Map<InstallMethod, UpdateStrategy>();
  for (const s of strategies) {
    map.set(s.method, s);
  }
  return map;
}

export { NpmStrategy } from './npm.js';
export { GitStrategy } from './git.js';
export { DockerStrategy } from './docker.js';
export { AptStrategy } from './apt.js';
export { BrewStrategy } from './brew.js';
export { TarballStrategy } from './tarball.js';
export { K8sStrategy } from './k8s.js';
