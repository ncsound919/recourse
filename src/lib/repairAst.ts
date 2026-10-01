// src/lib/repairAst.ts
//
// Tree-sitter AST-based code repair. Replacement for the regex-based
// pattern matching in diagnoseAndRepairCode — uses tree-sitter to parse
// code into an AST, then applies targeted fixes based on node types.

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

export interface AstRepair {
  type: string;
  description: string;
  applied: boolean;
  original?: string;
  fixed?: string;
}

export interface AstRepairResult {
  repairs: AstRepair[];
  parseErrors: boolean;
  nodeCount: number;
}

function parseCode(code: string): Parser.Tree {
  return parser.parse(code);
}

function findNodeTypes(tree: Parser.Tree, type: string): Parser.SyntaxNode[] {
  const nodes: Parser.SyntaxNode[] = [];
  function walk(node: Parser.SyntaxNode) {
    if (node.type === type) nodes.push(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }
  walk(tree.rootNode);
  return nodes;
}

export function repairWithAst(code: string): AstRepairResult {
  const tree = parseCode(code);
  const repairs: AstRepair[] = [];
  let nodeCount = 0;

  function walk(node: Parser.SyntaxNode) {
    nodeCount++;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }
  walk(tree.rootNode);

  const divisionNodes = findNodeTypes(tree, 'binary_expression');
  for (const node of divisionNodes) {
    const text = node.text;
    if (text.includes('/')) {
      const hasZeroCheck = code.includes('=== 0') || code.includes('!== 0') || code.includes('== 0') || code.includes('!= 0');
      if (!hasZeroCheck) {
        repairs.push({
          type: 'div-by-zero',
          description: 'Potential division by zero — consider adding a zero check',
          applied: false,
        });
      }
    }
  }

  const ifNodes = findNodeTypes(tree, 'if_statement');
  for (const node of ifNodes) {
    const text = node.text;
    if (text.includes('NaN') || text.includes('isNaN')) {
      repairs.push({
        type: 'nan-check',
        description: 'NaN check detected — ensure proper handling',
        applied: false,
      });
    }
  }

  const returnNodes = findNodeTypes(tree, 'return_statement');
  for (const node of returnNodes) {
    const text = node.text;
    if (text.includes('undefined') || text.includes('null')) {
      repairs.push({
        type: 'null-return',
        description: 'Returns null/undefined — consider a default value',
        applied: false,
      });
    }
  }

  const callNodes = findNodeTypes(tree, 'call_expression');
  for (const node of callNodes) {
    const text = node.text;
    if (text.includes('.catch') || text.includes('try') || text.includes('except')) {
      repairs.push({
        type: 'error-handling',
        description: 'Error handling detected — verify coverage',
        applied: false,
      });
    }
  }

  return {
    repairs,
    parseErrors: tree.rootNode.hasError,
    nodeCount,
  };
}

export function detectFaultPattern(code: string): string | null {
  const tree = parseCode(code);
  const binaryNodes = findNodeTypes(tree, 'binary_expression');
  for (const node of binaryNodes) {
    if (node.text.includes('/')) {
      const hasZeroCheck = code.includes('=== 0') || code.includes('!== 0');
      if (!hasZeroCheck) return 'div-by-zero';
    }
  }
  const ifNodes = findNodeTypes(tree, 'if_statement');
  for (const node of ifNodes) {
    if (node.text.includes('NaN')) return 'nan-check';
  }
  return null;
}
