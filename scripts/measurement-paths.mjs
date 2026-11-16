import { readdir, readFile, writeFile } from 'node:fs/promises';

// Build-owned inventory • unknown URLs and 404s never become public analytics paths.
const dist = new URL('../dist/', import.meta.url);
const configUrl = new URL('measurement/sites.json', dist);
const config = JSON.parse(await readFile(configUrl, 'utf8'));
const site = config.sites.find(site => site.domain === 'ludusequipamentos.com');
if (!site) throw new Error('Ludus measurement configuration missing');
const files = (await readdir(dist, { recursive: true })).map(path => path.replaceAll('\\', '/'));
site.publicPaths = files.filter(path => path.endsWith('.html') && path !== '404.html' && path !== '404/index.html').map(path => '/' + path.replace(/(?:^|\/)index\.html$/, '').replace(/\.html$/, '')).sort();
if (!site.publicPaths.includes('/') || !site.publicPaths.includes('/orcamento')) throw new Error('Expected public routes missing');
await writeFile(configUrl, JSON.stringify(config, null, 2) + '\n');
console.log('Medição Ludus • ' + site.publicPaths.length + ' rotas públicas verificadas no build');
