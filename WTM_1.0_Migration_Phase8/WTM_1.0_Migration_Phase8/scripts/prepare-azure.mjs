import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const out = path.join(root, 'azure-package');

try { await access(path.join(dist, 'index.html')); } catch {
  throw new Error('dist/index.html is missing. Run npm run build first.');
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(dist, path.join(out, 'dist'), { recursive: true });
await copyFile(path.join(root, 'server.cjs'), path.join(out, 'server.cjs'));
await copyFile(path.join(root, 'web.config'), path.join(out, 'web.config'));

const sourcePackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const productionPackage = {
  name: 'wtm-1.0-production',
  private: true,
  version: sourcePackage.version || '1.0.0',
  engines: sourcePackage.engines,
  scripts: { start: 'node server.cjs' },
};
await writeFile(path.join(out, 'package.json'), `${JSON.stringify(productionPackage, null, 2)}\n`);
await writeFile(path.join(out, 'DEPLOYMENT.txt'), `WTM ${productionPackage.version}\n\nZip the CONTENTS of this folder (not the folder itself) for Azure App Service ZIP deployment.\nThe package contains no company well database.\n`);
console.log(`Prepared ${path.relative(root, out)} for Windows Azure App Service.`);
