// src/dream/autograd.ts — Scalar Autograd Engine
//
// This module now DELEGATES to the mature `autograd-ts` library instead of the
// original hand-rolled micrograd-style engine. All computation-graph
// construction, reverse-mode chain-rule backward passes, and deterministic
// topological ordering come from autograd-ts's `Value` class.
//
// The public API preserved for consumers is identical to the old engine:
//   constructor(data, _children = [])   data   grad
//   add / mul / pow / sub / div / relu / sigmoid   backward()
//
// autograd-ts's `Value` provides add/sub/mul/div/pow/tanh/relu/backward but NOT
// `sigmoid()`. Two small bridges restore the full original surface:
//
//   1. autograd-ts builds every intermediate graph node as an instance of its
//      own base `Value` class, so `sigmoid()` is patched onto that base
//      prototype (guarded, idempotent). Without this, chained calls like
//      `qkDot.mul(k).sigmoid()` would fail at runtime on library-produced
//      nodes.
//   2. A thin subclass restores the original two-argument constructor
//      `(data, _children)` contract and re-declares the value-returning ops
//      with covariant types so callers keep seeing `Value` everywhere.
//
// The math (including sigmoid's derivative sig*(1-sig) * out.grad) matches the
// old engine exactly, so forward values and accumulated gradients are
// unchanged.

// Deep path import: `autograd-ts`'s package.json `exports` map only exposes an
// `import` condition, so the CJS esbuild bundle's `require('autograd-ts')`
// fails with ERR_PACKAGE_PATH_NOT_EXPORTED at boot. Pointing at the actual
// `dist/index.js` (a CJS file, matching the package `main`) resolves in both
// ESM dev (tsx) and the production CJS bundle.
// Runtime load that works in BOTH ESM dev (tsx) and the production CJS bundle:
// the package `exports` map only exposes an `import` condition, so resolving the
// bare specifier fails with ERR_PACKAGE_PATH_NOT_EXPORTED under createRequire.
// Pointing at the real `dist/index.js` file path (the package `main`) bypasses
// the exports map entirely — the file itself is CJS.
// Runtime load that works in BOTH ESM dev (tsx) and the production CJS bundle:
// the package `exports` map only exposes an `import` condition, so resolving the
// bare specifier fails with ERR_PACKAGE_PATH_NOT_EXPORTED under createRequire.
// `require.resolve('autograd-ts')` with the package's OWN directory as a search
// path still honors exports, so instead we build the path from the install
// root (node_modules is always beside the app) and require the CJS file
// directly. The file at dist/index.js is CJS.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Value as AutogradValueType } from 'autograd-ts';

const _importMetaUrl: string | undefined =
  typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : undefined;
const _require =
  typeof __filename !== 'undefined'
    ? createRequire(__filename)
    : createRequire(_importMetaUrl ?? process.cwd());
const _packagePath = _require.resolve.paths('autograd-ts')
  ?.map((base) => join(base, 'autograd-ts', 'dist', 'index.js'))
  .find((candidate) => _require('node:fs').existsSync(candidate));
const { Value: AutogradValue } = _require(
  _packagePath ?? join(process.cwd(), 'node_modules', 'autograd-ts', 'dist', 'index.js'),
) as typeof import('autograd-ts');

/** Builds a sigmoid node: out = 1 / (1 + exp(-x)), with the chain-rule
 *  backward pass d x.grad += sig * (1 - sig) * out.grad. */
function makeSigmoid(x: AutogradValueType): AutogradValueType {
  const sig = 1 / (1 + Math.exp(-x.data));
  const out = new AutogradValue(sig, {
    prev: [x],
    op: 'sigmoid',
    backward: () => {
      x.grad += sig * (1 - sig) * out.grad;
    },
  });
  return out;
}

// autograd-ts constructs every intermediate node as its base `Value`, so the
// activation must exist on that prototype for chained `.sigmoid()` calls on
// library-produced nodes to keep working.
const baseProto = AutogradValue.prototype as unknown as {
  sigmoid?: (this: AutogradValueType) => AutogradValueType;
};
baseProto.sigmoid = function (this: AutogradValueType): AutogradValueType {
    return makeSigmoid(this);
  };

/** Scalar computation-graph node (reverse-mode autodiff), backed by
 *  autograd-ts. Public surface is API-compatible with the original engine. */
export class Value extends AutogradValue {
  constructor(data: number, children: Value[] = []) {
    super(data, children.length > 0 ? { prev: children } : undefined);
  }

  add(v: Value | number): Value {
    return super.add(v) as Value;
  }

  mul(v: Value | number): Value {
    return super.mul(v) as Value;
  }

  pow(n: number): Value {
    return super.pow(n) as Value;
  }

  sub(v: Value | number): Value {
    return super.sub(v) as Value;
  }

  div(v: Value | number): Value {
    return super.div(v) as Value;
  }

  relu(): Value {
    return super.relu() as Value;
  }

  tanh(): Value {
    return super.tanh() as Value;
  }

  neg(): Value {
    return super.neg() as Value;
  }

  sigmoid(): Value {
    return makeSigmoid(this) as Value;
  }
}
