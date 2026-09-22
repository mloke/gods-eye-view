import path from 'node:path';
import { promises as fsp } from 'node:fs';

/**
 * Cached proxy for public-domain / CC planetary maps used as Solar System
 * entity materials. Planets use Solar System Scope 2k maps (CC BY 4.0).
 * Moons use NASA 3D Resources JPEGs (U.S. public domain). Failures are the
 * client's problem — the layer falls back to color.
 */
function nasa3d(name) {
  const path = `Images and Textures/${name}/${name}.jpg`.replace(/ /g, '%20');
  return `https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/${path}`;
}

const TEXTURES = Object.freeze({
  sun: 'https://www.solarsystemscope.com/textures/download/2k_sun.jpg',
  mercury: 'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg',
  venus: 'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg',
  earth: 'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
  moon: 'https://www.solarsystemscope.com/textures/download/2k_moon.jpg',
  mars: 'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
  jupiter: 'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg',
  saturn: 'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg',
  uranus: 'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg',
  neptune: 'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg',
  phobos: nasa3d('Mars - Phobos'),
  deimos: nasa3d('Mars - Deimos'),
  io: nasa3d('Jupiter - Io (A)'),
  europa: nasa3d('Jupiter - Europa'),
  ganymede: nasa3d('Jupiter - Ganymede'),
  callisto: nasa3d('Jupiter - Callisto'),
  mimas: nasa3d('Saturn - Mimas'),
  enceladus: nasa3d('Saturn - Enceladus'),
  dione: nasa3d('Saturn - Dione'),
  rhea: nasa3d('Saturn - Rhea'),
  titan: nasa3d('Saturn - Titan'),
  iapetus: nasa3d('Saturn - Iapetus'),
  miranda: nasa3d('Uranus - Miranda'),
  ariel: nasa3d('Uranus - Ariel'),
  umbriel: nasa3d('Uranus - Umbriel'),
  titania: nasa3d('Uranus - Titania'),
  oberon: nasa3d('Uranus - Oberon'),
  triton: nasa3d('Neptune - Triton'),
  charon: nasa3d('Pluto - Charon'),
});

const TTL_MS = 30 * 24 * 3600_000;

export function planetaryTextureProxy() {
  const cacheDir = path.join(process.cwd(), '.gev-cache', 'planetary-textures');
  const mem = new Map();
  const inflight = new Map();

  const diskPath = (id) => path.join(cacheDir, `${id}.jpg`);

  async function readDisk(id) {
    try {
      const body = await fsp.readFile(diskPath(id));
      const stat = await fsp.stat(diskPath(id));
      return { at: stat.mtimeMs, body };
    } catch {
      return null;
    }
  }

  async function writeDisk(id, body) {
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      await fsp.writeFile(diskPath(id), body);
    } catch {
      /* cache is best-effort */
    }
  }

  async function fetchUpstream(id) {
    const url = TEXTURES[id];
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent':
          'gods-eye-view-planetary-textures/1.0 (+https://github.com/bilawalsidhu/gods-eye-view)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length < 32) throw new Error('empty texture');
    return { at: Date.now(), body };
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/planetary-textures', async (req, res) => {
      const id = String(req.url || '')
        .replace(/^\//, '')
        .split('?')[0]
        .toLowerCase();
      if (!Object.hasOwn(TEXTURES, id)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('unknown body');
        return;
      }
      const send = (status, body) => {
        if (res.writableEnded) return;
        res.writeHead(status, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        });
        res.end(body);
      };
      const cached = mem.get(id) || (await readDisk(id));
      if (cached && Date.now() - cached.at < TTL_MS) {
        mem.set(id, cached);
        send(200, cached.body);
        return;
      }
      if (!inflight.has(id)) {
        inflight.set(
          id,
          fetchUpstream(id)
            .then((entry) => {
              mem.set(id, entry);
              void writeDisk(id, entry.body);
              return entry;
            })
            .finally(() => inflight.delete(id)),
        );
      }
      try {
        const entry = await inflight.get(id);
        send(200, entry.body);
      } catch {
        if (cached) {
          send(200, cached.body);
          return;
        }
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('texture unavailable');
      }
    });
  };

  return {
    name: 'gev-planetary-textures-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}

export { TEXTURES as PLANETARY_TEXTURE_URLS };
