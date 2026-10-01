// src/lib/astRelExtract.ts
//
// AST-based @rel annotation extraction using Tree-sitter.
// Parses TypeScript/JavaScript source code and extracts relational predicates
// from JSDoc/comment annotations. This is the production-grade replacement
// for the regex-based extractor in relationExtract.ts — it understands
// code structure, so it can distinguish real annotations from @rel mentions
// in strings or unrelated comments.

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

export interface AstRel {
  functor: string;
  args: string[];
  line: number;
  column: number;
}

export interface AstExtractResult {
  relations: AstRel[];
  parseErrors: boolean;
  nodeCount: number;
}

const ALLOWED_FUNCTORS = new Set([
  'maps_to', 'depends_on', 'derives', 'increases', 'decreases',
  'part_of', 'causes', 'enables', 'inhibits',
]);

function extractCommentText(node: Parser.SyntaxNode): string {
  const text = node.text;
  if (text.startsWith('/**') || text.startsWith('/*')) {
    return text.replace(/^\/\*+/, '').replace(/\*\/$/, '').replace(/^\s*\*\s?/gm, '').trim();
  }
  if (text.startsWith('//')) {
    return text.replace(/^\/\/\s?/, '').trim();
  }
  return text;
}

function parseRelAnnotations(commentText: string): AstRel[] {
  const rels: AstRel[] = [];
  const re = /@rel\s+([a-z_]+)\s+([^\r\n*]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(commentText)) !== null) {
    const functor = match[1].toLowerCase();
    if (!ALLOWED_FUNCTORS.has(functor)) continue;
    const args = match[2]
      .trim()
      .split(/\s*->\s*|\s*,\s*|\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (args.length === 0) continue;
    rels.push({ functor, args, line: 0, column: 0 });
  }
  return rels;
}

export function extractAstRelations(sourceCode: string): AstExtractResult {
  const tree = parser.parse(sourceCode);
  const relations: AstRel[] = [];
  let nodeCount = 0;

  function walk(node: Parser.SyntaxNode) {
    nodeCount++;
    if (node.type === 'comment' || node.type === 'comment_directive') {
      const commentText = extractCommentText(node);
      const rels = parseRelAnnotations(commentText);
      for (const rel of rels) {
        rel.line = node.startPosition.row + 1;
        rel.column = node.startPosition.column + 1;
        relations.push(rel);
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }

  walk(tree.rootNode);
  return {
    relations,
    parseErrors: tree.rootNode.hasError,
    nodeCount,
  };
}

export function extractAstRelationsFromSource(sourceCode: string): AstRel[] {
  return extractAstRelations(sourceCode).relations;
}
