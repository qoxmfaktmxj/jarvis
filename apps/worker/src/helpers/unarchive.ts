// apps/worker/src/helpers/unarchive.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Validates zip entries for path traversal (zip slip) before extraction.
 * Throws if any entry would escape targetDir.
 */
async function validateZipEntries(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath], {
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  const entries = stdout.trim().split('\n').filter(Boolean);
  const targetAbs = resolve(targetDir) + sep;
  for (const entry of entries) {
    const resolved = resolve(targetDir, entry);
    if (!resolved.startsWith(targetAbs) && resolved !== resolve(targetDir)) {
      throw new Error(
        `Zip slip detected: entry "${entry}" would escape extraction directory`,
      );
    }
  }
}

/**
 * Extracts an archive file into the target directory.
 * Supports: .zip, .tar, .tar.gz, .tgz
 * Guards against zip slip / path traversal attacks.
 */
export async function unarchive(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  const lower = archivePath.toLowerCase();

  if (lower.endsWith('.zip')) {
    // Validate entries before extraction to prevent zip slip
    await validateZipEntries(archivePath, targetDir);
    await execFileAsync('unzip', ['-o', '-q', archivePath, '-d', targetDir], {
      timeout: 120_000,
    });
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    // --no-absolute-filenames prevents absolute path entries from escaping targetDir
    await execFileAsync(
      'tar',
      ['-xzf', archivePath, '-C', targetDir, '--no-absolute-filenames'],
      { timeout: 120_000 },
    );
  } else if (lower.endsWith('.tar')) {
    await execFileAsync(
      'tar',
      ['-xf', archivePath, '-C', targetDir, '--no-absolute-filenames'],
      { timeout: 120_000 },
    );
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
