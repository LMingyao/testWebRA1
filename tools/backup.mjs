import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeImage, validateContent, contentImagePaths } from '../app/shared.js';
import { seedSQL } from './prepare-d1.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function validateManifest(manifest) {
  if (manifest.format!=='gallery-backup-v1'||!Array.isArray(manifest.media)) throw new Error('Unsupported backup manifest.');
  validateContent(manifest.data);
  const paths=new Set();
  for(const media of manifest.media) {
    if(!safeImage(media.path)||paths.has(media.path)||!Number.isInteger(media.bytes)||media.bytes<0) throw new Error('Invalid media manifest.');
    paths.add(media.path);
  }
  for(const document of [manifest.data,...(manifest.history || []).map(h=>h.data)]) {
    validateContent(document);
    for(const reference of contentImagePaths(document)) if(!paths.has(reference)) throw new Error(`Missing media registration: ${reference}`);
  }
}
export async function verifyBackup(directory) {
  const root=path.resolve(directory), manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  validateManifest(manifest);
  for(const media of manifest.media) {
    const bytes=await readFile(path.join(root,media.path));
    if(media.bytes!==bytes.length||!media.digest||digest(bytes)!==media.digest) throw new Error(`Media checksum failed: ${media.path}`);
  }
  return manifest;
}
export async function createBackup(manifest, directory, fetcher=fetch) {
  validateManifest(manifest);
  const root=path.resolve(directory), base=new URL(manifest.mediaBase);
  if(base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/')||
     !(base.protocol==='https:'||(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))) throw new Error('Invalid media base.');
  try { await access(path.join(root,'manifest.json')); throw new Error('Backup already exists; choose a new directory.'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  await mkdir(root,{recursive:true});
  const copy=structuredClone(manifest);
  for(const media of copy.media) {
    const target=path.resolve(root,media.path);
    if(!target.startsWith(root+path.sep)) throw new Error('Backup path escaped its directory.');
    try {
      const existing=await readFile(target);
      if(existing.length!==media.bytes || (media.digest && digest(existing)!==media.digest)) throw new Error(`Existing backup file differs: ${media.path}`);
      media.digest=digest(existing);continue;
    } catch(error) { if(error.code!=="ENOENT")throw error; }
    let bytes;
    for(let attempt=0;;attempt++) {
      try {
        const response=await fetcher(new URL(media.path,base),{signal:AbortSignal.timeout(30000)});
        if(!response.ok) throw new Error(`Media download failed: ${media.path} (${response.status})`);
        bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length!==media.bytes||(media.digest&&digest(bytes)!==media.digest)) throw new Error(`Media checksum failed: ${media.path}`);
        break;
      } catch(error) { if(attempt>=2)throw error; }
    }
    media.digest=digest(bytes);
    await mkdir(path.dirname(target),{recursive:true});
    // Exclusive writes preserve files from an incomplete backup or another run.
    await writeFile(target,bytes,{flag:'wx'});
  }
  await writeFile(path.join(root,'manifest.json'),JSON.stringify(copy,null,2)+'\n',{flag:'wx'});
  const quote = value => `'${String(value).replaceAll("'","''")}'`;
  const history = [...(copy.history || [])].reverse().map(item=>`INSERT INTO gallery_history(revision,document,saved_at) VALUES(${quote(item.revision)},${quote(JSON.stringify(item.data))},${quote(item.savedAt)});`).join('\n');
  await writeFile(path.join(root,'restore-content.sql'),seedSQL(copy.data,copy.media)+history+'\n',{flag:'wx'});
  await verifyBackup(root);
  return copy;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv[2]==='--verify') {const result=await verifyBackup(process.argv[3]);console.log(`Verified ${result.media.length} media files and content.`);}
    else {
      if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node tools/backup.mjs MANIFEST.json DIRECTORY | --verify DIRECTORY');
      const manifest=JSON.parse(await readFile(process.argv[2],'utf8'));
      const result=await createBackup(manifest,process.argv[3]);console.log(`Backup verified: ${result.media.length} files. Restore SQL is for an empty content database only.`);
    }
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
