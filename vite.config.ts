import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// import the defuss plugin - JSX for the UI components (resource bar, menu, ...)
import defuss from 'defuss-vite';
import { glbToObj } from './tools/models/glb.mjs';
import { FLAG, HUMANOID, MILL, QUADRUPED, loadClips, packClips, type Clip } from './src/gl/clips';

/**
 * `import house from '../models/buildings/house.glb?model'` - das Modell als { obj, mtl }-Text
 * (tools/models/glb.mjs). Die Zeile `mtllib buildings/house.mtl` im OBJ nennt die Datei (Galerie).
 */
function glbModels(): Plugin {
  const suffix = '.glb?model';
  const models = join(import.meta.dirname, 'src/models');
  return {
    name: 'glb-model',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith(suffix)) return null;
      const file = id.slice(0, -'?model'.length);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(glbToObj(readFileSync(file), `${relative(models, file).slice(0, -4)}.mtl`))};`;
    },
  };
}

/**
 * `import clips from '../models/clips/humanoid.glb?clips'` - die Clip-Bibliothek
 * schon gelesen (loadClips in src/gl/clips.ts, mit der .json daneben), statt
 * beim Start im Browser: das kostete dort ~170 ms (M4). Die Zahlenreihen als
 * Base64 (Float32), ausgepackt von unpackClips. Geht das Lesen schief, eine
 * leere Bibliothek und eine Warnung - wie im Spiel: die Figuren stehen still.
 */
function glbClips(): Plugin {
  const suffix = '.glb?clips';
  const rigs = { humanoid: HUMANOID, humanoid_sit: HUMANOID, quadruped: QUADRUPED, mill: MILL, flag: FLAG } as const;
  return {
    name: 'glb-clips',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith(suffix)) return null;
      const file = id.slice(0, -'?clips'.length);
      const manifestFile = file.replace(/\.glb$/, '.json');
      this.addWatchFile(file);
      this.addWatchFile(manifestFile);
      const rig = rigs[basename(file, '.glb') as keyof typeof rigs];
      let clips: Clip[] = [];
      try {
        if (!rig) throw new Error(`kein Skelett für ${basename(file)}`);
        const url = `data:model/gltf-binary;base64,${readFileSync(file).toString('base64')}`;
        clips = loadClips(url, JSON.parse(readFileSync(manifestFile, 'utf8')), rig);
      } catch (error) {
        this.warn(`Clips ${basename(file)} nicht gelesen - die Figuren stehen still: ${error}`);
      }
      return `export default ${packClips(clips)};`;
    },
  };
}

/**
 * Nur mit `npm run dev` und der Adresse mit ?saveBillboards: nimmt die
 * Baumbilder entgegen, die das Spiel rendert (EntityRenderer.saveBillboard),
 * und legt sie als PNG in tools/export/out/billboards/ ab - zum Ansehen.
 */
function saveBillboards(): Plugin {
  const dir = join(import.meta.dirname, 'tools/export/out/billboards');
  rmSync(dir, { recursive: true, force: true })
  return {
    name: 'save-billboards',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__billboards', (req, res) => {
        const name = basename(decodeURIComponent(req.url ?? ''));
        if (req.method !== 'POST' || !/^[\w.-]+\.png$/.test(name)) {
          res.statusCode = 400; 
          res.end(); 
          return;  
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          mkdirSync(dir, { recursive: true });

          writeFileSync(join(dir, name), Buffer.concat(chunks));
          console.log(`billboards saved ${relative(import.meta.dirname,join(dir, name))}`)
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // add the defuss() plugin to make JSX transpilation work
  plugins: [glbModels(), glbClips(), saveBillboards(), defuss()],
  // Skelett-Clips aus Blender (src/models/clips/*.glb) werden mit ?inline eingebettet.
  assetsInclude: ['**/*.glb'],
  build: {
    // Neben dem Spiel auch das L-System-Werkzeug (tools/lsystem/) und seine Galerie.
    rollupOptions: {
      input: {
        main: 'index.html',
        lsystem: 'tools/lsystem/index.html',
        lsystemGallery: 'tools/lsystem/gallery.html',
      },
    },
  },
});
