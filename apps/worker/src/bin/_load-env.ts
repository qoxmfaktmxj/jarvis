/**
 * Side-effect-only module that loads the repo-root `.env` regardless of
 * invocation cwd. Must be imported FIRST (before any module that reads
 * `process.env` at module load, e.g. `@jarvis/db/client`).
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
