// apps/worker/src/helpers/unarchive.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Extracts an archive file into the target directory.
 * Supports: .zip, .tar, .tar.gz, .tgz
 */
export async function unarchive(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  const lower = archivePath.toLowerCase();

  if (lower.endsWith('.zip')) {
    await execFileAsync('unzip', ['-o', '-q', archivePath, '-d', targetDir], {
      timeout: 120_000,
    });
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await execFileAsync('tar', ['-xzf', archivePath, '-C', targetDir], {
      timeout: 120_000,
    });
  } else if (lower.endsWith('.tar')) {
    await execFileAsync('tar', ['-xf', archivePath, '-C', targetDir], {
      timeout: 120_000,
    });
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }
}

/**
 * Counts regular files in a directory recursively.
 */
export async function countFiles(dir: string): Promise<number> {
  const { stdout } = await execFileAsync('find', [dir, '-type', 'f'], {
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim().split('\n').filter(Boolean).length;
}

/**
 * Returns directory size in bytes using du.
 */
export async function dirSizeBytes(dir: string): Promise<number> {
  const { stdout } = await execFileAsync('du', ['-sb', dir], {
    timeout: 30_000,
  });
  return parseInt(stdout.split('\t')[0] ?? '0', 10);
}
