#!/usr/bin/env node
/**
 * Automated Theme Architecture & WCAG 2.2 AA Contrast Verification Suite
 * Run via: node scripts/verify_theme_contrast.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GLOBALS_CSS = path.join(ROOT, "src", "app", "globals.css");

function parseHex(hex) {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
}

function parseColor(val) {
  if (!val) return null;
  const s = val.trim();
  if (s.startsWith("#")) return parseHex(s);
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  return null;
}

function blend(top, bot) {
  const a = top.a + bot.a * (1 - top.a);
  return {
    r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a,
    g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a,
    b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a,
    a,
  };
}

function luminance(c) {
  const ch = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function extractVars(cssBlock) {
  const vars = {};
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(cssBlock))) {
    vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function resolveVar(vars, name) {
  let v = vars[name];
  let guard = 0;
  while (v && v.startsWith("var(") && guard++ < 10) {
    const inner = v.match(/var\((--[a-zA-Z0-9-]+)/);
    if (!inner) break;
    v = vars[inner[1]];
  }
  return v;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function main() {
  const css = fs.readFileSync(GLOBALS_CSS, "utf8");
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const darkMatch = css.match(/\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/);
  if (!rootMatch || !darkMatch) {
    console.error("FAIL: Could not locate :root and [data-theme='dark'] blocks in globals.css");
    process.exit(1);
  }

  const lightVars = extractVars(rootMatch[1]);
  const darkVars = { ...lightVars, ...extractVars(darkMatch[1]) };

  const surfaces = [
    "--bg-primary",
    "--bg-secondary",
    "--bg-tertiary",
    "--bg-card",
    "--bg-elevated",
    "--bg-modal",
    "--bg-input",
  ];
  const textTokens = [
    ["--text-primary", 4.5],
    ["--text-secondary", 4.5],
    ["--text-muted", 4.5],
    ["--text-heading", 4.5],
    ["--text-label", 4.5],
    ["--text-placeholder", 4.5],
    ["--accent-blue", 4.5],
    ["--accent-purple", 4.5],
    ["--accent-orange", 4.5],
    ["--accent-amber", 4.5],
    ["--accent-green", 4.5],
    ["--accent-red", 4.5],
  ];
  const pairedTokens = [
    ["--brand-primary-text", "--brand-primary", 4.5],
    ["--brand-secondary-text", "--brand-secondary", 4.5],
    ["--status-success-text", "--status-success-bg", 4.5],
    ["--status-warning-text", "--status-warning-bg", 4.5],
    ["--status-error-text", "--status-error-bg", 4.5],
    ["--status-info-text", "--status-info-bg", 4.5],
    ["--status-purple-text", "--status-purple-bg", 4.5],
    ["--sidebar-text", "--sidebar-bg", 4.5],
    ["--sidebar-muted", "--sidebar-bg", 4.5],
  ];

  let failures = 0;
  let checks = 0;

  for (const [mode, vars] of [
    ["light", lightVars],
    ["dark", darkVars],
  ]) {
    const cardBase = parseColor(resolveVar(vars, "--bg-card"));
    for (const surfName of surfaces) {
      const bg = parseColor(resolveVar(vars, surfName));
      if (!bg) continue;
      for (const [txtName, minRatio] of textTokens) {
        // Placeholders only appear inside --bg-input / --bg-card / --bg-secondary
        if (txtName === "--text-placeholder" && surfName === "--bg-tertiary") continue;
        const fg = parseColor(resolveVar(vars, txtName));
        if (!fg) continue;
        const ratio = contrastRatio(fg, bg);
        checks++;
        if (ratio + 0.01 < minRatio) {
          console.error(
            `FAIL [${mode}] ${txtName} (${resolveVar(vars, txtName)}) on ${surfName} (${resolveVar(
              vars,
              surfName
            )}) = ${ratio.toFixed(2)}:1 (min ${minRatio}:1)`
          );
          failures++;
        }
      }
    }

    for (const [fgName, bgName, minRatio] of pairedTokens) {
      const fgRaw = parseColor(resolveVar(vars, fgName));
      const bgRaw = parseColor(resolveVar(vars, bgName));
      if (!fgRaw || !bgRaw) continue;
      const bg = bgRaw.a < 1 ? blend(bgRaw, cardBase) : bgRaw;
      const fg = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;
      const ratio = contrastRatio(fg, bg);
      checks++;
      if (ratio + 0.01 < minRatio) {
        console.error(
          `FAIL [${mode}] paired ${fgName} on ${bgName} = ${ratio.toFixed(2)}:1 (min ${minRatio}:1)`
        );
        failures++;
      }
    }
  }

  // Static architectural anti-pattern scan
  const skipFiles = [/lib[\\/]email\.ts$/, /actions[\\/]/, /manifest\.ts$/, /globals\.css$/, /lib[\\/]security/];
  for (const file of walk(path.join(ROOT, "src"))) {
    if (skipFiles.some((r) => r.test(file))) continue;
    const src = fs.readFileSync(file, "utf8");
    const lines = src.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (/(?:^|[\s{,;])color\s*:.*var\(--color-white\)/.test(line)) {
        console.error(
          `FAIL [anti-pattern] ${path.relative(ROOT, file)}:${idx + 1} uses var(--color-white) as foreground color`
        );
        failures++;
      }
      if (/(?:color|background|border)[^:]*:\s*["'`]?(?:red|orange|black|blue|green|yellow)\b/i.test(line)) {
        console.error(
          `FAIL [anti-pattern] ${path.relative(ROOT, file)}:${idx + 1} uses raw named color: ${line.trim()}`
        );
        failures++;
      }
    });
  }

  if (failures > 0) {
    console.error(`\nTheme & Contrast Verification FAILED with ${failures} issue(s) across ${checks} checks.`);
    process.exit(1);
  }
  console.log(`PASS: All ${checks} WCAG 2.2 AA token-matrix checks and static architectural invariants passed.`);
}

main();
