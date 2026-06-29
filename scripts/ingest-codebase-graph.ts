// vault/scripts/ingest-codebase-graph.ts
// Demere Mnemonic Engine - Codebase Graph Parser
// Analyzes local codebases to map files, symbols, and dependencies into a knowledge graph.

import * as fs from 'fs';
import * as path from 'path';

interface GraphNode {
  id: string;
  type: 'file' | 'class' | 'function' | 'variable';
  name: string;
  filePath: string;
  line?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'imports' | 'contains' | 'calls';
}

interface CodebaseGraph {
  workspaceId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
}

const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'out', 'dist', '.git', '.firebase']);
const INCLUDE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Regular expressions to extract imports and exports
const IMPORT_REGEX = /import\s+?(?:(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([^'"]+)['"]|['"]([^'"]+)['"])/g;
const EXPORT_CLASS_REGEX = /export\s+(?:default\s+)?class\s+(\w+)/g;
const EXPORT_FUNC_REGEX = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g;
const EXPORT_CONST_REGEX = /export\s+(?:default\s+)?const\s+(\w+)\s*=/g;

class CodebaseParser {
  private rootDir: string;
  private workspaceId: string;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];

  constructor(rootDir: string, workspaceId: string) {
    this.rootDir = path.resolve(rootDir);
    this.workspaceId = workspaceId;
  }

  public parse(): CodebaseGraph {
    console.log(`🔍 Demere parsing codebase at: ${this.rootDir}`);
    this.traverseDirectory(this.rootDir);
    return {
      workspaceId: this.workspaceId,
      nodes: this.nodes,
      edges: this.edges,
      updatedAt: new Date().toISOString(),
    };
  }

  private traverseDirectory(dir: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (EXCLUDE_DIRS.has(item)) continue;
        this.traverseDirectory(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (INCLUDE_EXTS.has(ext)) {
          this.parseFile(fullPath);
        }
      }
    }
  }

  private parseFile(filePath: string) {
    const relativePath = path.relative(this.rootDir, filePath);
    const fileId = `file:${relativePath}`;
    
    // Add file node
    this.nodes.push({
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      filePath: relativePath,
    });

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Parse imports and contains
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Extract Imports
      let importMatch;
      while ((importMatch = IMPORT_REGEX.exec(line)) !== null) {
        const importPath = importMatch[1] || importMatch[2];
        if (importPath) {
          this.edges.push({
            source: fileId,
            target: importPath, // We map paths directly; relative paths can be resolved later if needed
            type: 'imports',
          });
        }
      }

      // 2. Extract Defined Symbols
      let classMatch;
      while ((classMatch = EXPORT_CLASS_REGEX.exec(line)) !== null) {
        const name = classMatch[1];
        const symbolId = `${fileId}:class:${name}`;
        this.nodes.push({
          id: symbolId,
          type: 'class',
          name,
          filePath: relativePath,
          line: i + 1,
        });
        this.edges.push({
          source: fileId,
          target: symbolId,
          type: 'contains',
        });
      }

      let funcMatch;
      while ((funcMatch = EXPORT_FUNC_REGEX.exec(line)) !== null) {
        const name = funcMatch[1];
        const symbolId = `${fileId}:func:${name}`;
        this.nodes.push({
          id: symbolId,
          type: 'function',
          name,
          filePath: relativePath,
          line: i + 1,
        });
        this.edges.push({
          source: fileId,
          target: symbolId,
          type: 'contains',
        });
      }

      let constMatch;
      while ((constMatch = EXPORT_CONST_REGEX.exec(line)) !== null) {
        const name = constMatch[1];
        // Skip uppercase config constants, prioritize hook or helper symbols
        if (name === name.toUpperCase()) continue;
        const symbolId = `${fileId}:var:${name}`;
        this.nodes.push({
          id: symbolId,
          type: 'variable',
          name,
          filePath: relativePath,
          line: i + 1,
        });
        this.edges.push({
          source: fileId,
          target: symbolId,
          type: 'contains',
        });
      }
    }
  }
}

// CLI Execution Support
if (require.main === module) {
  const root = process.argv[2] || '.';
  const workspaceId = process.argv[3] || 'vault';
  const parser = new CodebaseParser(root, workspaceId);
  const result = parser.parse();

  const outDir = path.resolve(__dirname, '../out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'codebase-graph.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(`✅ Codebase knowledge graph written to: ${outFile}`);
  console.log(`   Nodes: ${result.nodes.length}, Edges: ${result.edges.length}`);
}
