// src/dream/autograd.ts — Scalar Autograd Engine
//
// A minimalist scalar automatic differentiation engine implementing
// exact reverse-mode computation graphs (backpropagation). This provides
// the exact forward-cache/backward-recurrence pattern for the chain rule,
// ensuring strict determinism based on the mathematical topology.
//
// Each Value node caches its forward pass output and its local gradient
// derivative, recursively applying the chain rule in reverse topological
// order (from the loss function backwards to the parameters).

export class Value {
  data: number;
  grad: number;
  private _backward: () => void;
  private _prev: Set<Value>;

  constructor(data: number, _children: Value[] = []) {
    this.data = data;
    this.grad = 0; // The derivative of the loss with respect to this value
    this._backward = () => {};
    this._prev = new Set(_children);
  }

  add(other: Value | number): Value {
    const otherVal = other instanceof Value ? other : new Value(other);
    const out = new Value(this.data + otherVal.data, [this, otherVal]);
    
    out._backward = () => {
      this.grad += 1.0 * out.grad;
      otherVal.grad += 1.0 * out.grad;
    };
    
    return out;
  }

  mul(other: Value | number): Value {
    const otherVal = other instanceof Value ? other : new Value(other);
    const out = new Value(this.data * otherVal.data, [this, otherVal]);
    
    out._backward = () => {
      // Local derivative times the output error signal (chain rule)
      this.grad += otherVal.data * out.grad;
      otherVal.grad += this.data * out.grad;
    };
    
    return out;
  }

  pow(other: number): Value {
    const out = new Value(Math.pow(this.data, other), [this]);
    out._backward = () => {
      this.grad += (other * Math.pow(this.data, other - 1)) * out.grad;
    };
    return out;
  }
  
  sub(other: Value | number): Value {
    const otherVal = other instanceof Value ? other : new Value(other);
    return this.add(otherVal.mul(-1));
  }
  
  div(other: Value | number): Value {
    const otherVal = other instanceof Value ? other : new Value(other);
    return this.mul(otherVal.pow(-1));
  }

  relu(): Value {
    const out = new Value(this.data < 0 ? 0 : this.data, [this]);
    out._backward = () => {
      this.grad += (out.data > 0 ? 1.0 : 0.0) * out.grad;
    };
    return out;
  }

  sigmoid(): Value {
    const sig = 1 / (1 + Math.exp(-this.data));
    const out = new Value(sig, [this]);
    out._backward = () => {
      this.grad += (sig * (1 - sig)) * out.grad;
    };
    return out;
  }

  backward() {
    // Topological sort of all nodes in the graph
    const topo: Value[] = [];
    const visited = new Set<Value>();
    
    const buildTopo = (v: Value) => {
      if (!visited.has(v)) {
        visited.add(v);
        for (const child of v._prev) {
          buildTopo(child);
        }
        topo.push(v);
      }
    };
    
    buildTopo(this);
    
    // Seed the gradient of the loss with 1.0
    this.grad = 1.0;
    
    // Reverse topological order: apply chain rule backward through the graph
    for (let i = topo.length - 1; i >= 0; i--) {
      topo[i]._backward();
    }
  }
}
