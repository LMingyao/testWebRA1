import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function buildLegacy(root) {
  const template = await readFile(path.join(root, 'tools/legacy-page.html'), 'utf8');
  for (const era of ['', '2022', '2023']) {
    const html = template.replaceAll('{{era}}', era).replaceAll('{{title}}', era ? `${era} revisited` : 'Legacy views');
    await writeFile(path.join(root, era ? `legacy-${era}.html` : 'legacy.html'), html);
  }
}
