// @ts-check
// Release metrics: runs the validate steps and both builds, timing each, then
// appends one JSON line to metrics.jsonl and prints the change from the last
// line. Run before the version commit and commit the line with it, so git
// history holds one data point per release.
//
//   node scripts/metrics.mjs [--out <file>]
//
// It measures the checkout it runs in (the working directory), so it can also
// be pointed at an older release checked out elsewhere. A step the checkout's
// package.json does not define is left out; a step that fails stops the run,
// since its timing and counts would not be comparable.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const outArg = process.argv.indexOf('--out')
const outFile = resolve(outArg > -1 ? process.argv[outArg + 1] : join(root, 'metrics.jsonl'))

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const scripts = pkg.scripts ?? {}

/** @param {string} cmd @param {string[]} args */
function run(cmd, args) {
  const started = performance.now()
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })
  const seconds = Math.round((performance.now() - started) / 100) / 10
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr)
    throw new Error(`metrics: \`${cmd} ${args.join(' ')}\` failed`)
  }
  return { seconds, stdout: result.stdout }
}

/** @param {string} cmd */
const git = (cmd) => run('git', cmd.split(' ')).stdout.trim()

// --- validate, step by step (unit tests run with a JSON report for counts) ---
const unitReport = join(tmpdir(), `read-html-vitest-${process.pid}.json`)
/** @type {Record<string, number>} */
const validate = {}
for (const step of ['typecheck', 'lint', 'format:check', 'knip', 'test:unit', 'vendor-check']) {
  if (!scripts[step]) continue
  const args =
    step === 'test:unit'
      ? ['vitest', 'run', '--reporter=json', `--outputFile=${unitReport}`]
      : ['run', step]
  validate[step] = run(step === 'test:unit' ? 'npx' : 'npm', args).seconds
}
validate.total = Math.round(Object.values(validate).reduce((a, b) => a + b, 0) * 10) / 10

// --- builds ---
/** @type {Record<string, number>} */
const build = {}
for (const step of ['build', 'build:single']) {
  if (scripts[step]) build[step] = run('npm', ['run', step]).seconds
}

// --- sizes ---
/** @param {string} dir @returns {string[]} */
const filesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  )
/** @param {string[]} files */
const sizeOf = (files) => ({
  bytes: files.reduce((sum, file) => sum + statSync(file).size, 0),
  gzip: files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0),
})
/** @type {Record<string, { bytes: number, gzip: number }>} */
const sizes = {}
const single = join(root, 'dist-single/READ.html')
if (existsSync(single)) sizes['READ.html'] = sizeOf([single])
if (existsSync(join(root, 'dist'))) sizes.dist = sizeOf(filesUnder(join(root, 'dist')))

// --- tests ---
/** @type {Record<string, number>} */
const tests = {}
if (existsSync(unitReport)) {
  const report = JSON.parse(readFileSync(unitReport, 'utf8'))
  tests.unit = report.numTotalTests
  tests.unitSkipped = report.numPendingTests + report.numTodoTests
  tests.unitFiles = report.numTotalTestSuites
}
// Listing is cheap and needs no browser; running e2e is not part of validate.
if (scripts['test:e2e']) {
  const listed = run('npx', ['playwright', 'test', '--list', '--project=chromium']).stdout
  const total = listed.match(/Total: (\d+) tests?/)
  if (total) tests.e2e = Number(total[1])
}

// --- code and dependencies ---
const srcFiles = filesUnder(join(root, 'src')).filter((file) => /\.(ts|js|svelte)$/.test(file))
const code = {
  srcFiles: srcFiles.length,
  srcLines: srcFiles.reduce((sum, file) => sum + readFileSync(file, 'utf8').split('\n').length, 0),
  dependencies: Object.keys(pkg.dependencies ?? {}).length,
  devDependencies: Object.keys(pkg.devDependencies ?? {}).length,
}

const record = {
  version: pkg.version,
  // At release time the version commit does not exist yet: this is its parent.
  commit: git('rev-parse --short HEAD'),
  // Changes beyond the release files themselves mean the numbers describe
  // something other than the commit.
  dirty: git('status --porcelain --untracked-files=no')
    .split('\n')
    .some(
      (line) =>
        line && !/ (package\.json|package-lock\.json|CHANGELOG\.md|metrics\.jsonl)$/.test(line),
    ),
  date: new Date().toISOString(),
  node: process.version,
  validate,
  build,
  sizes,
  tests,
  code,
}

// --- compare with the previous line, then append ---
/** @param {Record<string, unknown>} value @param {string} [prefix] @returns {[string, number][]} */
const numbers = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, inner]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof inner === 'number') return [[path, inner]]
    if (inner && typeof inner === 'object')
      return numbers(/** @type {Record<string, unknown>} */ (inner), path)
    return []
  })

const lines = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim().split('\n') : []
const previous =
  lines.length > 0 && lines.at(-1) ? JSON.parse(/** @type {string} */ (lines.at(-1))) : null

console.log(
  `metrics: ${record.version} (${record.commit}${record.dirty ? ', uncommitted changes' : ''})`,
)
const before = new Map(previous ? numbers(previous) : [])
for (const [path, value] of numbers(record)) {
  const old = before.get(path)
  if (old === undefined) {
    console.log(`  ${path}  ${value}`)
  } else if (old !== value) {
    const pct =
      old === 0 ? '' : ` (${value > old ? '+' : ''}${(((value - old) / old) * 100).toFixed(0)}%)`
    console.log(`  ${path}  ${old} → ${value}${pct}`)
  }
}
if (previous) console.log(`  (unchanged values omitted; compared with ${previous.version})`)

appendFileSync(outFile, JSON.stringify(record) + '\n')
console.log(`metrics: appended to ${outFile}`)
