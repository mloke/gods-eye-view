import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);
const PERSONAL_FILE = path.join(REPO_ROOT, 'config', 'location-tags.json');
const EXAMPLE_FILE = path.join(
  REPO_ROOT,
  'config',
  'location-tags.example.json',
);

async function readTagsFile() {
  try {
    return await readFile(PERSONAL_FILE, 'utf8');
  } catch {
    return readFile(EXAMPLE_FILE, 'utf8');
  }
}

/**
 * Serve the checkout's personal tags file when present, otherwise the template.
 *
 * Routes:
 *   GET /api/location-tags → the JSON list from config/location-tags.json
 */
export function locationTagsProxy() {
  return {
    name: 'location-tags-local',
    configureServer(server) {
      server.middlewares.use('/api/location-tags', async (_req, res) => {
        try {
          const body = await readTagsFile();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ places: [] }));
        }
      });
    },
  };
}
