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
  const index = process.argv.lastIndexOf(name);
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

function buildErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function truncateText(value, max = 2800) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function classifyReasonCode(stage, errorMessage) {
  const message = errorMessage.toLowerCase();
  if (stage === 'clone') {
    return 'clone_failed';
  }
  if (stage === 'select_file' || message.includes('could not find a candidate file')) {
    return 'candidate_file_not_found';
  }
  if (stage === 'append_marker') {
    return 'marker_write_failed';
  }
  if (stage === 'ci_impact') {
    return 'ci_impact_failed';
  }
  if (message.includes('timed out')) {
    return 'timeout';
  }
  return 'unexpected_error';
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
    maxBuffer: 1024 * 1024 * 12,
  });
  await execFileAsync('git', ['checkout', '-b', 'autoqa-dogfood'], {
    cwd: target,
    maxBuffer: 1024 * 1024 * 12,
  });
  return target;
}

async function chooseChangedFile(repoRoot) {
  const listCommand = `Get-ChildItem -Path '${repoRoot}' -Recurse -File | Where-Object { $_.FullName -match '(tests?|e2e|specs?)' -or $_.Name -match '\\.(spec|test)\\.(ts|tsx|js|jsx|mjs|cjs)$' } | Select-Object -First 1 -ExpandProperty FullName`;
  const fallbackCommand = `Get-ChildItem -Path '${repoRoot}' -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs | Select-Object -First 1 -ExpandProperty FullName`;
  const primary = await execFileAsync('powershell', ['-NoProfile', '-Command', listCommand], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
  });
  const first = primary.stdout.trim();
  if (first) {
    return first;
  }

  const fallback = await execFileAsync('powershell', ['-NoProfile', '-Command', fallbackCommand], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 4,
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
      maxBuffer: 1024 * 1024 * 12,
    }
  );
  return result.stdout.trim();
}

function summarizeReasonCodes(results) {
  const map = new Map();
  for (const result of results) {
    if (result.status !== 'failed') {
      continue;
    }
    map.set(result.reasonCode, (map.get(result.reasonCode) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reasonCode, count]) => ({ reasonCode, count }));
}

async function writeDogfoodArtifacts(results, options) {
  await mkdir(reportsDir, { recursive: true });
  const timestamp = Date.now();
  const markdownPath = resolve(reportsDir, `autoqa-dogfood-${timestamp}.md`);
  const jsonPath = resolve(reportsDir, `autoqa-dogfood-${timestamp}.json`);
  const latestMarkdownPath = resolve(reportsDir, 'autoqa-dogfood-latest.md');
  const latestJsonPath = resolve(reportsDir, 'autoqa-dogfood-latest.json');
  const passed = results.filter((entry) => entry.status === 'passed').length;
  const failed = results.filter((entry) => entry.status === 'failed').length;
  const failureBreakdown = summarizeReasonCodes(results);

  const body = [
    '# AutoQA Dogfood Report',
    '',
    `- Generated at: ${new Date().toISOString()}`,
    `- Repo file: ${options.reposFile}`,
    `- Selected repos: ${results.length}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    `- Keep clones: ${options.keepClones}`,
    `- Soft fail mode: ${options.softFail}`,
    '',
    '## Top failure reason codes',
    ...(failureBreakdown.length
      ? failureBreakdown.map((entry) => `- ${entry.reasonCode}: ${entry.count}`)
      : ['- none']),
    '',
    ...results.flatMap((result, index) => [
      `## ${index + 1}. ${result.name}`,
      '',
      `- Status: ${result.status}`,
      `- Reason code: ${result.reasonCode}`,
      `- Repo: ${result.url}`,
      `- Local path: ${result.repoPath ?? 'n/a'}`,
      `- Changed file: ${result.changedFile ?? 'n/a'}`,
      ...(result.errorMessage ? [`- Error: ${result.errorMessage}`] : []),
      '',
      '```text',
      truncateText(result.summary || '(empty)'),
      '```',
      '',
    ]),
  ].join('\n');

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    options,
    totals: {
      selected: results.length,
      passed,
      failed,
    },
    topFailureReasonCodes: failureBreakdown,
    results,
  };

  await writeFile(markdownPath, body, 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, 'utf8');
  await writeFile(latestMarkdownPath, body, 'utf8');
  await writeFile(latestJsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, 'utf8');

  return { markdownPath, jsonPath, latestMarkdownPath, latestJsonPath, failed };
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
      '  --soft-fail          Always exit 0 and report per-repo failures in artifacts',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const reposFile = resolve(invocationCwd, getOption('--repos-file', defaultReposFile));
const limit = Number.parseInt(getOption('--limit', '0'), 10) || 0;
const keepClones = getFlag('--keep-clones');
const softFail = getFlag('--soft-fail');

const repos = await loadRepoList(reposFile);
const selectedRepos = limit > 0 ? repos.slice(0, limit) : repos;
await mkdir(dogfoodDir, { recursive: true });

const results = [];
for (const repo of selectedRepos) {
  let localRepoPath = null;
  let changedFile = null;
  let stage = 'clone';

  try {
    localRepoPath = await cloneRepo(repo.name, repo.url);
    stage = 'select_file';
    const changedFileAbsolutePath = await chooseChangedFile(localRepoPath);
    changedFile = normalizeRepoFilePath(localRepoPath, changedFileAbsolutePath);
    stage = 'append_marker';
    await appendDogfoodMarker(changedFileAbsolutePath);
    stage = 'ci_impact';
    const summary = await runCiImpact(localRepoPath);
    results.push({
      ...repo,
      status: 'passed',
      reasonCode: 'none',
      repoPath: localRepoPath,
      changedFile,
      summary,
    });
  } catch (error) {
    const details = error;
    const message = buildErrorMessage(details);
    const reasonCode = classifyReasonCode(stage, message);
    const stderr =
      details && typeof details === 'object' && 'stderr' in details && typeof details.stderr === 'string'
        ? details.stderr
        : '';
    const stdout =
      details && typeof details === 'object' && 'stdout' in details && typeof details.stdout === 'string'
        ? details.stdout
        : '';
    results.push({
      ...repo,
      status: 'failed',
      reasonCode,
      repoPath: localRepoPath,
      changedFile,
      errorMessage: message,
      summary: truncateText([stderr, stdout].filter(Boolean).join('\n')) || message,
    });
  } finally {
    if (!keepClones && localRepoPath) {
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

const artifacts = await writeDogfoodArtifacts(results, {
  reposFile,
  limit,
  keepClones,
  softFail,
});
process.stdout.write(`${artifacts.markdownPath}\n`);
process.stdout.write(`${artifacts.jsonPath}\n`);

if (artifacts.failed > 0 && !softFail) {
  process.exitCode = 1;
}
