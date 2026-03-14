import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const workspaceDir = resolve(packageDir, '..', '..');
const ciImpactScript = resolve(packageDir, 'scripts', 'ci-impact.mjs');
const defaultReposFile = resolve(workspaceDir, 'dogfood.repos.json');
const dogfoodDir = resolve(workspaceDir, '.dogfood');
const reportsDir = resolve(packageDir, 'reports');
const invocationCwd = process.env.INIT_CWD ?? process.cwd();

function getOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    return fallback;
  }

  return process.argv[index + 1];
}

function getFlag(name) {
  return process.argv.includes(name);
}

function normalizeRepoFilePath(repoRoot, filePath) {
  return filePath.substring(repoRoot.length + 1).replace(/\\/g, '/');
}

async function loadRepoList(reposFilePath) {
  const content = await readFile(reposFilePath, 'utf8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${reposFilePath}`);
  }

  return parsed.map((entry) => {
    if (!entry?.name || !entry?.url) {
      throw new Error(`Invalid dogfood repo entry in ${reposFilePath}`);
    }

    return {
      name: String(entry.name),
      url: String(entry.url),
    };
  });
}

async function cloneRepo(name, url) {
  const target = resolve(dogfoodDir, name);
  await rm(target, { recursive: true, force: true });
  await execFileAsync('git', ['clone', '--depth', '1', url, target], {
    cwd: workspaceDir,
    maxBuffer: 1024 * 1024 * 10,
  });
  await execFileAsync('git', ['checkout', '-b', 'autoqa-dogfood'], {
    cwd: target,
    maxBuffer: 1024 * 1024 * 10,
  });
  return target;
}

async function chooseChangedFile(repoRoot) {
  const listCommand = `Get-ChildItem -Path '${repoRoot}' -Recurse -File | Where-Object { $_.FullName -match '(tests?|e2e|specs?)' -or $_.Name -match '\\.(spec|test)\\.(ts|tsx|js|jsx|mjs|cjs)$' } | Select-Object -First 1 -ExpandProperty FullName`;
  const fallbackCommand = `Get-ChildItem -Path '${repoRoot}' -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs | Select-Object -First 1 -ExpandProperty FullName`;
  const primary = await execFileAsync('powershell', ['-NoProfile', '-Command', listCommand], {
    cwd: repoRoot,
  });
  const first = primary.stdout.trim();
  if (first) {
    return first;
  }

  const fallback = await execFileAsync('powershell', ['-NoProfile', '-Command', fallbackCommand], {
    cwd: repoRoot,
  });
  const next = fallback.stdout.trim();
  if (!next) {
    throw new Error(`Could not find a candidate file in ${repoRoot}`);
  }

  return next;
}

async function appendDogfoodMarker(absolutePath) {
  const content = await readFile(absolutePath, 'utf8');
  if (content.includes('autoqa dogfood marker')) {
    return;
  }

  const suffix = content.endsWith('\n') ? '' : '\n';
  await writeFile(absolutePath, `${content}${suffix}// autoqa dogfood marker\n`, 'utf8');
}

async function runCiImpact(repoRoot) {
  const result = await execFileAsync(
    process.execPath,
    [ciImpactScript, '--repo', repoRoot, '--working-tree', '--format', 'plain'],
    {
      cwd: workspaceDir,
      maxBuffer: 1024 * 1024 * 10,
    }
  );
  return result.stdout.trim();
}

async function writeDogfoodReport(results) {
  await mkdir(reportsDir, { recursive: true });
  const path = resolve(reportsDir, `autoqa-dogfood-${Date.now()}.md`);
  const body = [
    '# AutoQA Dogfood Report',
    '',
    ...results.flatMap((result, index) => [
      `## ${index + 1}. ${result.name}`,
      '',
      `- Repo: ${result.url}`,
      `- Local path: ${result.repoPath}`,
      `- Changed file: ${result.changedFile}`,
      '',
      '```text',
      result.summary || '(empty)',
      '```',
      '',
    ]),
  ].join('\n');
  await writeFile(path, body, 'utf8');
  return path;
}

if (getFlag('--help')) {
  process.stdout.write(
    [
      'Usage: node packages/mcp-server/scripts/dogfood.mjs [options]',
      '',
      'Options:',
      '  --repos-file <path>  JSON file containing repositories to dogfood',
      '  --limit <number>     Limit number of repositories',
      '  --keep-clones        Keep cloned repositories under .dogfood after the run',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const reposFile = resolve(invocationCwd, getOption('--repos-file', defaultReposFile));
const limit = Number.parseInt(getOption('--limit', '0'), 10) || 0;
const keepClones = getFlag('--keep-clones');

const repos = await loadRepoList(reposFile);
const selectedRepos = limit > 0 ? repos.slice(0, limit) : repos;
await mkdir(dogfoodDir, { recursive: true });

const results = [];
for (const repo of selectedRepos) {
  const localRepoPath = await cloneRepo(repo.name, repo.url);

  try {
    const changedFileAbsolutePath = await chooseChangedFile(localRepoPath);
    await appendDogfoodMarker(changedFileAbsolutePath);
    const summary = await runCiImpact(localRepoPath);
    results.push({
      ...repo,
      repoPath: localRepoPath,
      changedFile: normalizeRepoFilePath(localRepoPath, changedFileAbsolutePath),
      summary,
    });
  } finally {
    if (!keepClones) {
      await rm(localRepoPath, { recursive: true, force: true });
    }
  }
}

if (!keepClones) {
  const remainingEntries = await readdir(dogfoodDir).catch(() => []);
  if (remainingEntries.length === 0) {
    await rm(dogfoodDir, { recursive: true, force: true });
  }
}

const reportPath = await writeDogfoodReport(results);
process.stdout.write(`${reportPath}\n`);
