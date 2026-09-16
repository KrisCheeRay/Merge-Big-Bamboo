import { cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fanpageDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(fanpageDir, '..');
const outputDir = resolve(projectDir, 'dist');
const stagingDir = resolve(projectDir, '.dist-site-staging');
const gameDir = resolve(stagingDir, 'game');
const viteBin = resolve(projectDir, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(viteBin)) {
  console.error('缺少依赖，请先运行 npm install。');
  process.exit(1);
}

rmSync(stagingDir, { recursive: true, force: true });

const build = spawnSync(
  process.execPath,
  [viteBin, 'build', '--configLoader', 'native', '--outDir', '.dist-site-staging/game'],
  {
    cwd: projectDir,
    stdio: 'inherit',
  },
);

if (build.status !== 0) {
  rmSync(stagingDir, { recursive: true, force: true });
  process.exit(build.status ?? 1);
}

for (const file of ['index.html', 'style.css', 'app.js', 'fanpage_background.webp']) {
  cpSync(resolve(fanpageDir, file), resolve(stagingDir, file));
}

rmSync(outputDir, { recursive: true, force: true });
renameSync(stagingDir, outputDir);

console.log('\n网站构建完成：');
console.log(`  主页：${resolve(outputDir, 'index.html')}`);
console.log(`  游戏：${resolve(outputDir, 'game', 'index.html')}`);
