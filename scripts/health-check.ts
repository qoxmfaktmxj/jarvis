#!/usr/bin/env tsx
/**
 * scripts/health-check.ts
 * Checks all Jarvis services. Exit 0 if all healthy, exit 1 otherwise.
 */
import { Client as PgClient } from 'pg';
import * as Minio from 'minio';

interface ServiceStatus {
  name: string;
  healthy: boolean;
  latencyMs: number;
  message: string;
}

async function checkPostgres(): Promise<ServiceStatus> {
  const start = Date.now();
  const client = new PgClient({
    connectionString: process.env.DATABASE_URL || 'postgresql://jarvis:jarvispass@localhost:5436/jarvis',
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return { name: 'PostgreSQL', healthy: true, latencyMs: Date.now() - start, message: 'SELECT 1 OK' };
  } catch (err) {
    return { name: 'PostgreSQL', healthy: false, latencyMs: Date.now() - start, message: String(err) };
  }
}

async function checkMinio(): Promise<ServiceStatus> {
  const start = Date.now();
  const client = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT) || 9100,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'jarvisadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'jarvispassword',
  });
  try {
    const buckets = await client.listBuckets();
    return { name: 'MinIO', healthy: true, latencyMs: Date.now() - start, message: `${buckets.length} buckets` };
  } catch (err) {
    return { name: 'MinIO', healthy: false, latencyMs: Date.now() - start, message: String(err) };
  }
}

async function checkNextJs(): Promise<ServiceStatus> {
  const start = Date.now();
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010'}/api/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return { name: 'Next.js Web', healthy: res.ok, latencyMs: Date.now() - start, message: `HTTP ${res.status}` };
  } catch (err) {
    return { name: 'Next.js Web', healthy: false, latencyMs: Date.now() - start, message: String(err) };
  }
}

function printTable(statuses: ServiceStatus[]): void {
  const line = '─'.repeat(80);
  console.log('\nJarvis Health Check');
  console.log(line);
  console.log('Service              Status     ms       Message');
  console.log(line);
  for (const s of statuses) {
    const status = s.healthy ? '\x1b[32m  OK  \x1b[0m' : '\x1b[31m FAIL \x1b[0m';
    console.log(`${s.name.padEnd(20)} ${status}  ${String(s.latencyMs).padEnd(7)} ${s.message}`);
  }
  console.log(line);
  const allHealthy = statuses.every((s) => s.healthy);
  console.log(allHealthy ? '\x1b[32mAll services healthy\x1b[0m\n' : `\x1b[31m${statuses.filter(s => !s.healthy).length} unhealthy\x1b[0m\n`);
}

async function main(): Promise<void> {
  const checks = await Promise.allSettled([checkPostgres(), checkMinio(), checkNextJs()]);
  const results: ServiceStatus[] = checks.map(r =>
    r.status === 'fulfilled' ? r.value : { name: 'Unknown', healthy: false, latencyMs: 0, message: String((r as PromiseRejectedResult).reason) }
  );
  printTable(results);
  process.exit(results.every(s => s.healthy) ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
