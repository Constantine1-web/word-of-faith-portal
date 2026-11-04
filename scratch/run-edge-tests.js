const { spawn, execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/abasi/.gemini/antigravity/brain/a5b1827c-ef86-4e9b-9be8-ff5561e4449a/screenshots';
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const VIEWPORTS = [
  { name: '360px', width: 360, height: 780 },
  { name: '390px', width: 390, height: 844 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1024px', width: 1024, height: 768 },
  { name: '1440px', width: 1440, height: 900 }
];

const PAGES_TO_TEST = [
  { name: 'home', path: '/' },
  { name: 'portal_admin', path: '/preview-responsive' },
  { name: 'about', path: '/about' },
  { name: 'academics', path: '/academics' },
  { name: 'admissions', path: '/admissions' },
  { name: 'contact', path: '/contact' },
  { name: 'login', path: '/portal/login' }
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForServer(url) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url);
      if (res.status) return true;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Server did not respond at ${url}`);
}

async function main() {
  const PORT = 3030;
  const nextBin = path.join(process.cwd(), 'node_modules/next/dist/bin/next');
  console.log(`Starting Next.js on 127.0.0.1:${PORT}...`);
  const proc = spawn(process.execPath, [nextBin, 'dev', '--webpack', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proc.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('Ready') || s.includes('Local:')) console.log('[Next]', s.trim());
  });

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`);
    console.log(`✓ Next server ready on 127.0.0.1:${PORT}`);

    console.log('\nPre-compiling pages to warm the cache...');
    for (const pg of PAGES_TO_TEST) {
      await fetch(`http://127.0.0.1:${PORT}${pg.path}`);
      console.log(`  ✓ ${pg.path} compiled`);
    }

    console.log('\n======================================================');
    console.log('BEGINNING RESPONSIVE VIEWPORT TESTING AND SCREENSHOTS');
    console.log('======================================================');

    const results = [];

    for (const vp of VIEWPORTS) {
      console.log(`\n--- Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      for (const pg of PAGES_TO_TEST) {
        const outName = `${pg.name}_${vp.name}.png`;
        const outPath = path.join(ARTIFACT_DIR, outName);
        const url = `http://127.0.0.1:${PORT}${pg.path}`;

        const edgeArgs = [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          `--window-size=${vp.width},${vp.height}`,
          `--screenshot=${outPath}`,
          url
        ];

        try {
          execFileSync(EDGE_PATH, edgeArgs, { timeout: 30000 });
          if (fs.existsSync(outPath)) {
            const stats = fs.statSync(outPath);
            console.log(`  ✓ [${vp.name}] ${pg.name} (${stats.size} bytes) -> ${outName}`);
            results.push({ page: pg.name, viewport: vp.name, size: stats.size, success: true });
          } else {
            console.log(`  ✗ [${vp.name}] ${pg.name} -> Screenshot not created`);
            results.push({ page: pg.name, viewport: vp.name, success: false });
          }
        } catch (err) {
          console.error(`  ✗ [${vp.name}] ${pg.name} error:`, err.message);
          results.push({ page: pg.name, viewport: vp.name, success: false, error: err.message });
        }
      }
    }

    console.log('\n======================================================');
    console.log('VERIFICATION SUMMARY:');
    const passed = results.filter(r => r.success).length;
    console.log(`Total tests: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${results.length - passed}`);
    console.log(`Artifacts saved in: ${ARTIFACT_DIR}`);
    console.log('======================================================');
  } finally {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`); } catch {}
  }
}

main().catch(console.error);
