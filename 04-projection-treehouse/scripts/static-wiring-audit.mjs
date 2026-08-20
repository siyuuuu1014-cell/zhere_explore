// 前端静态接线审计：脚本顺序、id 引用完整性、按键覆盖、跨文件全局函数调用。
// 用法：node scripts/static-wiring-audit.mjs（进程内只读，不需要浏览器/服务）。

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const warnings = [];

const clientScripts = [
  'service-client.js', 'world-foundation.js', 'ui-shell.js', 'telemetry-system.js',
  'public-content.js', 'pricing-system.js', 'world-guide.js', 'world-events.js',
  'dynamic-locations.js', 'npc-stories.js', 'world-renderer.js', 'world-movement.js',
  'homestead-system.js', 'prototype.js', 'entry-system.js',
];

const html = readFileSync(path.join(appDir, 'index.html'), 'utf8');
const htmlScripts = [...html.matchAll(/<script src="\.\/([\w.-]+\.js)\?v=\d+"><\/script>/g)].map((match) => match[1]);

// 1. 加载顺序与清单一致性
const missingFromHtml = clientScripts.filter((name) => !htmlScripts.includes(name));
if (missingFromHtml.length) issues.push(`scripts not referenced in index.html: ${missingFromHtml.join(', ')}`);
const unknownInHtml = htmlScripts.filter((name) => !clientScripts.includes(name));
if (unknownInHtml.length) warnings.push(`scripts in html outside audit list: ${unknownInHtml.join(', ')}`);
const expectedOrder = ['service-client.js', 'world-foundation.js', 'ui-shell.js', 'telemetry-system.js', 'public-content.js', 'pricing-system.js', 'world-guide.js', 'world-events.js', 'dynamic-locations.js', 'npc-stories.js', 'world-renderer.js', 'world-movement.js', 'homestead-system.js', 'prototype.js', 'entry-system.js'];
const actualRelevant = htmlScripts.filter((name) => clientScripts.includes(name));
if (JSON.stringify(actualRelevant) !== JSON.stringify(expectedOrder)) warnings.push(`script order differs from expected: ${actualRelevant.join(' -> ')}`);

const files = {};
for (const name of clientScripts) {
  files[name] = readFileSync(path.join(appDir, name), 'utf8');
}
const allSource = Object.values(files).join('\n');
const loadedBefore = (name) => clientScripts.slice(0, clientScripts.indexOf(name)).join('\n');

// 2. id 引用完整性：$('#x') / getElementById('x') 引用的 id 必须在 HTML 或任一 JS 模板里定义
const definedIds = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((match) => match[1]));
for (const source of Object.values(files)) {
  for (const match of source.matchAll(/id="([\w-]+)"/g)) definedIds.add(match[1]);
  for (const match of source.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)) definedIds.add(match[1]);
  for (const match of source.matchAll(/id=\$\{?['"]([\w-]+)['"]\}?/g)) definedIds.add(match[1]);
}
const referencedIds = new Set([...allSource.matchAll(/\$\('#([\w-]+)'\)/g)].map((match) => match[1]));
for (const match of allSource.matchAll(/\$\('#([\w-]+)'/g)) referencedIds.add(match[1]);
const undefinedRefs = [...referencedIds].filter((id) => !definedIds.has(id)).sort();
if (undefinedRefs.length) issues.push(`referenced ids never defined anywhere (接口为空候选): ${undefinedRefs.join(', ')}`);

// 3. 按键覆盖：所有文案宣传的按键必须有 keydown 处理分支
const advertisedKeys = new Set();
for (const match of html.matchAll(/<kbd>([^<]+)<\/kbd>/g)) {
  match[1].split(/[\s/·]+/).forEach((key) => { if (key.trim()) advertisedKeys.add(key.trim().toLowerCase()); });
}
for (const source of Object.values(files)) {
  for (const match of source.matchAll(/key:\s*'([^']+)'/g)) {
    match[1].split(/[\s/·]+/).forEach((key) => { if (key.trim()) advertisedKeys.add(key.trim().toLowerCase()); });
  }
  for (const match of source.matchAll(/<kbd>([^<]+)<\/kbd>/g)) {
    match[1].split(/[\s/·]+/).forEach((key) => { if (key.trim()) advertisedKeys.add(key.trim().toLowerCase()); });
  }
}
const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'escape']);
const keydownSource = files['prototype.js'];
const handledKeys = new Set(movementKeys);
for (const key of ['e', 'f', 'g', 'b', 'n', 'p', 'q', 'j', 'h', 'r', 't', '?']) handledKeys.add(key);
const coveredComposite = new Set(['wasd', 'wasd / 方向键']);
const uncovered = [...advertisedKeys]
  .map((key) => (key === 'esc' ? 'escape' : key))
  .filter((key) => !handledKeys.has(key) && !coveredComposite.has(key) && !movementKeys.has(key))
  .sort();
if (uncovered.length) issues.push(`advertised keys without a keydown branch: ${uncovered.join(', ')}`);
const keyBranch = (key) => keydownSource.includes(`key === '${key}'`);
for (const key of handledKeys) {
  if (!keyBranch(key) && !movementKeys.has(key)) issues.push(`key '${key}' has no keydown branch in prototype.js`);
}

// 4. 跨文件全局函数调用：文件里调用的函数名不在本文件、此前文件或标准全局中定义
const browserGlobals = new Set(['document', 'window', 'console', 'localStorage', 'sessionStorage', 'crypto', 'fetch', 'URL', 'URLSearchParams', 'FormData', 'File', 'FileReader', 'Blob', 'Image', 'Audio', 'MutationObserver', 'IntersectionObserver', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'history', 'location', 'navigator', 'alert', 'confirm', 'prompt', 'CSS', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'AbortController', 'TextEncoder', 'Intl', 'atob', 'btoa', 'CustomEvent', 'Event']);
const KEYWORDS = new Set(['if', 'for', 'while', 'return', 'async', 'await', 'catch', 'finally', 'function', 'constructor', 'super', 'switch', 'typeof', 'instanceof', 'new', 'not', 'throw', 'in', 'of', 'do', 'else', 'delete', 'void', 'yield', 'class', 'extends']);
const definedBefore = new Set();
const undefinedCalls = [];
for (const name of clientScripts) {
  const source = files[name];
  const callSites = [...source.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]).filter((fn) => !browserGlobals.has(fn) && !KEYWORDS.has(fn));
  const localDefs = new Set([...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]));
  for (const match of source.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) localDefs.add(match[1]);
  localDefs.add('require');
  for (const fn of new Set(callSites)) {
    if (!localDefs.has(fn) && !definedBefore.has(fn)) undefinedCalls.push(`${name}:${fn}`);
  }
  const before = loadedBefore(name);
  for (const match of before.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) definedBefore.add(match[1]);
  for (const fn of localDefs) definedBefore.add(fn);
}
const KNOWN_RUNTIME_ONLY = new Set(['attachFormDraft', 'saveFormDraft', 'loadFormDraft', 'clearFormDraft', 'formDraftKey']);
const realUndefined = [...new Set(undefinedCalls)].filter((entry) => !KNOWN_RUNTIME_ONLY.has(entry.split(':')[1]));
if (realUndefined.length) warnings.push(`call sites of functions not defined in earlier scripts (运行时需确认): ${realUndefined.slice(0, 40).join(', ')}`);

// 5. 新增模块的整合点是否就位
const renderWorld = files['world-renderer.js'];
for (const fn of ['renderZoneEventMarkers', 'renderDynamicLocations', 'renderNpcStoryNodes']) {
  if (!renderWorld.includes(`typeof ${fn} === 'function'`)) issues.push(`renderWorld 未接入 ${fn}`);
}
const nearest = files['prototype.js'];
for (const probe of ["type: 'zone-event'", "type: 'dynamic-location'", "type: 'npc'"]) {
  if (!nearest.includes(probe)) issues.push(`nearestTarget 未接入 ${probe}`);
}

const summary = { issues, warnings, undefinedRefs, uncoveredKeys: uncovered, htmlScripts: actualRelevant };
console.log(JSON.stringify(summary, null, 2));
if (issues.length) process.exitCode = 1;
