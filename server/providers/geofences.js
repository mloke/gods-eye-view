import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);
const PERSONAL_FILE = path.join(REPO_ROOT, 'config', 'geofences.json');
const EXAMPLE_FILE = path.join(REPO_ROOT, 'config', 'geofences.example.json');

async function readFencesFile() {
  try {
    return await readFile(PERSONAL_FILE, 'utf8');
  } catch {
    return readFile(EXAMPLE_FILE, 'utf8');
  }
}

/**
 * Serve the checkout's personal geofences file when present, otherwise the template.
 *
 * Routes:
 *   GET /api/geofences → the JSON list from config/geofences.json
 */
export function geofencesProxy() {
  return {
    name: 'geofences-local',
    configureServer(server) {
      server.middlewares.use('/api/geofences', async (_req, res) => {
        try {
          const body = await readFencesFile();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ fences: [] }));
        }
      });
    },
  };
}
