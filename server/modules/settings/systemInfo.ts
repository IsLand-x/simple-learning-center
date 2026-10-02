import * as os from 'node:os';

export function readSystemInfo(system = os) {
  const cpus = system.cpus();
  return {
    hostname: system.hostname(),
    operatingSystem: `${system.type()} ${system.release()}`,
    architecture: system.arch(),
    cpu: { model: cpus[0]?.model || null, logicalCores: cpus.length },
    memory: { totalBytes: system.totalmem(), freeBytes: system.freemem() },
    nodeVersion: process.version,
    addresses: Object.entries(system.networkInterfaces()).flatMap(([name, addresses]) =>
      (addresses || [])
        .filter((address) => !address.internal)
        .map(({ address, family }) => ({ name, address, family })),
    ),
  };
}
