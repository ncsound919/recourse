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
  /**
   * Annotations whose functor is outside the controlled vocabulary.
   *
   * These are dropped, not admitted — but they are REPORTED, because a silent
   * drop is indistinguishable from "there were none". A caller that owes the
   * operator a reason for a rejected relation cannot produce one from a list
   * that was already filtered.
   */
  rejected: Array<{ functor: string; line: number; args: string }>;
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

interface RelScan {
  accepted: AstRel[];
  rejected: AstExtractResult['rejected'];
}

function parseRelAnnotations(commentText: string): RelScan {
  const accepted: AstRel[] = [];
  const rejected: AstExtractResult['rejected'] = [];
  const re = /@rel\s+([a-z_]+)\s+([^\r\n*]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(commentText)) !== null) {
    const functor = match[1].toLowerCase();
    const args = match[2]
      .trim()
      .split(/\s*->\s*|\s*,\s*|\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!ALLOWED_FUNCTORS.has(functor)) {
      rejected.push({ functor, line: 0, args: args.join(' ') });
      continue;
    }
    if (args.length === 0) {
      rejected.push({ functor, line: 0, args: '' });
      continue;
    }
    accepted.push({ functor, args, line: 0, column: 0 });
  }
  return { accepted, rejected };
}

export function extractAstRelations(sourceCode: string): AstExtractResult {
  const tree = parser.parse(sourceCode);
  const relations: AstRel[] = [];
  const rejected: AstExtractResult['rejected'] = [];
  let nodeCount = 0;

  function walk(node: Parser.SyntaxNode) {
    nodeCount++;
    if (node.type === 'comment' || node.type === 'comment_directive') {
      const line = node.startPosition.row + 1;
      const scan = parseRelAnnotations(extractCommentText(node));
      for (const rel of scan.accepted) {
        rel.line = line;
        rel.column = node.startPosition.column + 1;
        relations.push(rel);
      }
      for (const rej of scan.rejected) rejected.push({ ...rej, line });
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }

  walk(tree.rootNode);
  return {
    relations,
    rejected,
    parseErrors: tree.rootNode.hasError,
    nodeCount,
  };
}

export function extractAstRelationsFromSource(sourceCode: string): AstRel[] {
  return extractAstRelations(sourceCode).relations;
}
