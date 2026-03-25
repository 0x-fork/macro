#!/usr/bin/env bun
/**
 * Phase 1: Remove `export` keyword from unused exports (safe, keeps internal usage)
 * Phase 2: Delete truly dead code (no references anywhere)
 * Phase 3: Use biome to clean up orphaned imports (safe fixes only)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");

interface Item {
  file: string;
  name: string;
  line: number;
  kind: "export" | "type";
}

const data = JSON.parse(readFileSync("/tmp/knip-verified.json", "utf-8"));

// ============================================================
// PHASE 1: Remove export keyword
// ============================================================
console.log("=== PHASE 1: Removing export keywords ===");

const allItems: Item[] = [...data.dead, ...data.unexport];

function groupByFile(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    const existing = map.get(item.file) || [];
    existing.push(item);
    map.set(item.file, existing);
  }
  return map;
}

function removeExports(filePath: string, items: Item[]): number {
  const absPath = path.resolve(ROOT, filePath);
  let content: string;
  try { content = readFileSync(absPath, "utf-8"); } catch { return 0; }

  const lines = content.split("\n");
  let modified = 0;
  const sorted = [...items].sort((a, b) => b.line - a.line);

  for (const item of sorted) {
    const lineIdx = item.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;
    const line = lines[lineIdx];

    // Skip destructured signals
    if (line.match(/^\s*export\s+const\s+\[/)) continue;

    // Handle barrel re-exports
    const reExportMatch = line.match(/^(export\s+(?:type\s+)?)\{([^}]+)\}\s*(from\s.+)$/);
    if (reExportMatch) {
      const [, prefix, namesStr, suffix] = reExportMatch;
      const names = namesStr.split(",").map(n => n.trim());
      if (names.length === 1) { lines[lineIdx] = ""; modified++; continue; }
      const filtered = names.filter(n => n.split(/\s+as\s+/)[0].trim() !== item.name);
      if (filtered.length < names.length) {
        lines[lineIdx] = `${prefix}{ ${filtered.join(", ")} } ${suffix}`;
        modified++;
      }
      continue;
    }

    // Skip overloaded functions
    if (line.match(/^\s*export\s+(async\s+)?function\s/)) {
      const funcNameMatch = line.match(/function\s+(\w+)/);
      if (funcNameMatch) {
        const funcName = funcNameMatch[1];
        let hasOverload = false;
        for (let i = Math.max(0, lineIdx - 5); i < Math.min(lines.length, lineIdx + 5); i++) {
          if (i === lineIdx) continue;
          if (lines[i].match(new RegExp(`^\\s*export\\s+(async\\s+)?function\\s+${funcName}\\b`))) {
            hasOverload = true; break;
          }
        }
        if (hasOverload) continue;
      }
    }

    // Standard export removal
    if (line.match(/^\s*export\s+(default\s+)?(async\s+)?(function|const|let|var|class|type|interface|enum)\s/)) {
      lines[lineIdx] = line.replace(/^(\s*)export\s+(default\s+)?/, "$1");
      modified++; continue;
    }
    if (line.match(/^\s*export\s+/)) {
      lines[lineIdx] = line.replace(/^(\s*)export\s+/, "$1");
      modified++; continue;
    }
  }

  if (modified > 0) writeFileSync(absPath, lines.join("\n"));
  return modified;
}

const byFile = groupByFile(allItems);
let totalExportRemovals = 0;
for (const [file, items] of byFile) {
  totalExportRemovals += removeExports(file, items);
}
console.log(`Removed ${totalExportRemovals} export keywords.`);

// Fix customCaretPlugin (needs export for barrel index.ts)
const caretPath = path.resolve(ROOT, "packages/core/component/LexicalMarkdown/plugins/custom-caret/customCaretPlugin.ts");
if (existsSync(caretPath)) {
  let c = readFileSync(caretPath, "utf-8");
  c = c.replace(/^function customCursorPlugin\(\)/m, "export function customCursorPlugin()");
  writeFileSync(caretPath, c);
}

// ============================================================
// PHASE 2: Delete truly dead code
// ============================================================
console.log("\n=== PHASE 2: Deleting dead code ===");

// Re-verify dead items with fixed-string search ($ prefix breaks word boundaries)
function countRefs(name: string): number {
  try {
    const result = execSync(
      `rg -Fc '${name.replace(/'/g, "\\'")}' ${ROOT}/packages 2>/dev/null || true`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    ).trim();
    let total = 0;
    for (const l of result.split("\n").filter(Boolean)) {
      const count = parseInt(l.split(":").pop()!);
      if (!isNaN(count)) total += count;
    }
    return total;
  } catch { return 0; }
}

// Find the end of a function/const/type block
function findBlockEnd(lines: string[], startIdx: number): number {
  let braceCount = 0;
  let parenCount = 0;
  let started = false;

  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") { braceCount++; started = true; }
      else if (ch === "}") { braceCount--; if (started && braceCount === 0) return i; }
      else if (ch === "(") { parenCount++; started = true; }
      else if (ch === ")") { parenCount--; }
    }
    if (!started && lines[i].trimEnd().endsWith(";")) return i;
    if (started && braceCount === 0 && parenCount === 0 && lines[i].trimEnd().endsWith(";")) return i;
  }
  return startIdx;
}

function deleteBlock(lines: string[], startIdx: number): void {
  // Include preceding JSDoc/comments
  let start = startIdx;
  while (start > 0 && lines[start - 1].match(/^\s*(\*|\/\*\*|\*\/|\/\/)/)) start--;

  const endIdx = findBlockEnd(lines, startIdx);
  for (let i = start; i <= endIdx; i++) lines[i] = "";
}

const deadItems: Item[] = data.dead;
let deletedCount = 0;

// Group dead items by file
const deadByFile = groupByFile(deadItems);

for (const [file, items] of deadByFile) {
  const absPath = path.resolve(ROOT, file);
  let content: string;
  try { content = readFileSync(absPath, "utf-8"); } catch { continue; }

  const lines = content.split("\n");
  // Sort descending to avoid index shifts
  const sorted = [...items].sort((a, b) => b.line - a.line);

  for (const item of sorted) {
    // Re-verify: only delete if truly dead (1 ref = definition only)
    const refs = countRefs(item.name);
    if (refs > 1) {
      console.log(`  KEEP (${refs} refs): ${item.name} in ${file}`);
      continue;
    }

    const lineIdx = item.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    deleteBlock(lines, lineIdx);
    deletedCount++;
  }

  const cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  writeFileSync(absPath, cleaned);
}

console.log(`Deleted ${deletedCount} dead code blocks.`);

// Fix: remove barrel re-export of now-empty document.ts
const lexicalUtilsIndex = path.resolve(ROOT, "packages/lexical-core/utils/index.ts");
if (existsSync(lexicalUtilsIndex)) {
  let c = readFileSync(lexicalUtilsIndex, "utf-8");
  if (c.includes("export * from './document';")) {
    // Check if document.ts is now empty
    const docPath = path.resolve(ROOT, "packages/lexical-core/utils/document.ts");
    if (existsSync(docPath)) {
      const docContent = readFileSync(docPath, "utf-8").trim();
      if (docContent.length === 0 || !docContent.includes("export")) {
        c = c.replace("export * from './document';\n", "");
        writeFileSync(lexicalUtilsIndex, c);
        console.log("Removed empty document.ts barrel export.");
      }
    }
  }
}

// Fix: re-export types needed for public API inference
const freshSortPath = path.resolve(ROOT, "packages/core/util/freshSort.ts");
if (existsSync(freshSortPath)) {
  let c = readFileSync(freshSortPath, "utf-8");
  c = c.replace(/^interface FreshSortResult/m, "export interface FreshSortResult");
  writeFileSync(freshSortPath, c);
}
const servicePath = path.resolve(ROOT, "packages/core/service.ts");
if (existsSync(servicePath)) {
  let c = readFileSync(servicePath, "utf-8");
  c = c.replace(/^interface FunctionDefinition/m, "export interface FunctionDefinition");
  writeFileSync(servicePath, c);
}

// ============================================================
// PHASE 3: Clean up imports with biome (safe fixes only)
// ============================================================
console.log("\n=== PHASE 3: Cleaning up imports with biome ===");
try {
  execSync("bunx --bun biome lint --write --skip=nursery/noImportCycles packages/", {
    cwd: ROOT,
    stdio: "inherit",
  });
} catch {
  // biome exits non-zero if there are warnings, which is fine
}

// Add droppable directive type declaration and imports
console.log("\n=== PHASE 4: Adding droppable directive type declaration ===");
const droppablePath = path.resolve(ROOT, "packages/core/directive/droppable.ts");
writeFileSync(droppablePath, `/**
 * Type declaration for the \`use:droppable\` Solid directive from @thisbeyond/solid-dnd.
 *
 * The directive is created via \`createDroppable()\` and bound to elements as \`use:droppable\`.
 * The \`false && droppable\` pattern is used at each call-site to suppress unused-variable warnings.
 */

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      droppable: boolean;
    }
  }
}

export {};
`);

// Add import to all files using use:droppable
const droppableFiles = execSync(
  `rg -l "use:droppable" ${ROOT}/packages --glob '*.tsx' 2>/dev/null || true`,
  { encoding: "utf-8" }
).trim().split("\n").filter(l => l && !l.includes("directive/droppable"));

for (const f of droppableFiles) {
  let c = readFileSync(f, "utf-8");
  if (!c.includes("@core/directive/droppable")) {
    c = `import '@core/directive/droppable';\n${c}`;
    writeFileSync(f, c);
  }
}
console.log(`Added droppable directive import to ${droppableFiles.length} files.`);

console.log("\nDone! Run `bun run check` and `bun run lint` to verify.");
