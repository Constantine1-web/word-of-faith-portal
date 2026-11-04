const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ARTIFACT_DIR = path.resolve('C:/Users/abasi/.gemini/antigravity/brain/a5b1827c-ef86-4e9b-9be8-ff5561e4449a/screenshots');
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const widths = [
  { w: 360, h: 780, name: '360px' },
  { w: 390, h: 844, name: '390px' },
  { w: 768, h: 1024, name: '768px' },
  { w: 1024, h: 768, name: '1024px' },
  { w: 1440, h: 900, name: '1440px' }
];

const pages = [
  { name: 'home', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'academics', path: '/academics' },
  { name: 'admissions', path: '/admissions' },
  { name: 'contact', path: '/contact' },
  { name: 'login', path: '/portal/login' },
  { name: 'portal_admin', path: '/preview-responsive' }
];

async function main() {
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const PORT = 3088;
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  
  console.log('Starting Next.js dev server on port ' + PORT + '...');
  const proc = spawn(process.execPath, [nextBin, 'dev', '--webpack', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });

  const cleanup = () => {
    try {
      proc.kill();
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  // Poll until ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch (e) {}
  }

  if (!ready) {
    console.error('Server failed to start in 30 seconds');
    cleanup();
    process.exit(1);
  }
  console.log('Next.js dev server is ready.');

  // Pre-warm pages
  console.log('Pre-warming routes...');
  for (const page of pages) {
    try {
      await fetch(`http://127.0.0.1:${PORT}${page.path}`);
    } catch {}
  }
  await new Promise(r => setTimeout(r, 2000));

  const tmpProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-profile-'));
  console.log('Using temp profile:', tmpProfileDir);

  const results = [];

  for (const size of widths) {
    console.log(`\n=== Testing Viewport: ${size.name} (${size.w}x${size.h}) ===`);
    for (const page of pages) {
      const filename = `${page.name}_${size.name}.png`;
      const outFile = path.join(ARTIFACT_DIR, filename);
      const url = `http://127.0.0.1:${PORT}${page.path}`;

      try {
        execFileSync(EDGE_PATH, [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          `--user-data-dir=${tmpProfileDir}`,
          `--window-size=${size.w},${size.h}`,
          '--hide-scrollbars',
          `--screenshot=${outFile}`,
          url
        ], { timeout: 35000, stdio: ['ignore', 'ignore', 'ignore'] });

        const stat = fs.statSync(outFile);
        console.log(`[PASS] ${filename} (${stat.size} bytes)`);
        results.push({ filename, size: stat.size, status: 'OK' });
      } catch (err) {
        console.error(`[FAIL] ${filename}:`, err.message);
        results.push({ filename, status: 'ERROR', error: err.message });
      }
    }
  }

  try {
    fs.rmSync(tmpProfileDir, { recursive: true, force: true });
  } catch {}

  cleanup();
  console.log('\nFinished all screenshot captures!');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
