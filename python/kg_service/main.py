"""
Recourse Knowledge-Graph sidecar (NetworkX compute service).

Pure stateless compute: it receives a graph (nodes + edges) in each request and
returns real networkx metrics over THAT data. It holds no state and owns no
ontology copy, so the single source of truth stays in the TypeScript side
(src/lib/biotechKnowledgeGraph.ts). Honesty contract mirrors Recourse intake:
every endpoint is a read-only, whitelisted operation; a malformed payload is a
4xx with a structured error, never a fabricated answer.

Run:
    pip install fastapi uvicorn networkx
    uvicorn main:app --host 127.0.0.1 --port 8500
"""

from __future__ import annotations

from typing import Any, Optional

import networkx as nx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Recourse KG sidecar", version="1.0.0")


class NodeIn(BaseModel):
    id: str
    # arbitrary attributes carried through (evidence_tier, leg, targetProtein...)
    attrs: dict[str, Any] = Field(default_factory=dict)


class EdgeIn(BaseModel):
    source: str
    target: str
    relation: Optional[str] = None
    weight: Optional[float] = 1.0


class GraphIn(BaseModel):
    nodes: list[NodeIn] = Field(default_factory=list)
    edges: list[EdgeIn] = Field(default_factory=list)


def _build_graph(g: GraphIn) -> nx.Graph:
    G = nx.Graph()
    for n in g.nodes:
        G.add_node(n.id, **n.attrs)
    # isolated edges with unknown endpoints are dropped, mirroring lenient intake.
    for e in g.edges:
        if G.has_node(e.source) and G.has_node(e.target):
            G.add_edge(e.source, e.target, relation=e.relation, weight=e.weight or 1.0)
    return G


def _tier(node_attrs: dict[str, Any]) -> int:
    try:
        return int(node_attrs.get("evidence_tier", 0) or 0)
    except (TypeError, ValueError):
        return 0


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "kg", "networkx": nx.__version__}


@app.post("/kg/centrality")
def centrality(g: GraphIn) -> dict[str, Any]:
    """Degree / betweenness / closeness / pagerank over the supplied graph.

    A node with degree 0 (isolated) is honestly reported as such; its centrality
    is 0, never invented.
    """
    if not g.nodes:
        raise HTTPException(status_code=400, detail="no nodes supplied")
    G = _build_graph(g)
    undirected = G.to_undirected()
    n = G.number_of_nodes()
    # Guard: betweenness is O(VE); bound pagerank/closeness work on large graphs.
    if n > 4000:
        raise HTTPException(status_code=413, detail=f"graph too large for full analysis ({n} nodes)")

    degree = dict(G.degree())
    bt = nx.betweenness_centrality(undirected)
    clo = nx.closeness_centrality(undirected)
    pr = nx.pagerank(undirected, weight="weight") if n > 1 else {k: 1.0 for k in G.nodes()}

    rows = []
    for node in G.nodes():
        tier = _tier(G.nodes[node])
        rows.append(
            {
                "id": node,
                "degree": float(degree.get(node, 0)),
                "betweenness": round(bt.get(node, 0.0), 6),
                "closeness": round(clo.get(node, 0.0), 6),
                "pagerank": round(pr.get(node, 0.0), 6),
                "evidence_tier": tier,
                "isolated": degree.get(node, 0) == 0,
            }
        )

    rows.sort(key=lambda r: (-r["pagerank"], -r["degree"]))
    top = rows[: max(1, len(rows))]

    def _topk(key: str) -> list[dict[str, Any]]:
        ranked = sorted(rows, key=lambda r: -r[key])
        return ranked[: min(10, len(ranked))]

    return {
        "ok": True,
        "node_count": n,
        "edge_count": G.number_of_edges(),
        "connected_components": nx.number_connected_components(undirected),
        "hubs": _topk("degree"),
        "ranked": top,
        "by_metric": {m: _topk(m) for m in ("betweenness", "closeness", "pagerank")},
    }


@app.post("/kg/neighborhood")
def neighborhood(g: GraphIn, target: str) -> dict[str, Any]:
    """Ego subgraph of `target`: who it shares an edge with, by relation.

    Used to answer "which proven (high evidence_tier) entities is this candidate
    already adjacent to, and through which shared target/mechanism/leg edge?"
    """
    if not g.nodes:
        raise HTTPException(status_code=400, detail="no nodes supplied")
    if target not in {n.id for n in g.nodes}:
        raise HTTPException(status_code=400, detail=f"target '{target}' not in supplied nodes")
    G = _build_graph(g)
    if target not in G:
        raise HTTPException(status_code=400, detail=f"target '{target}' not in graph")

    nbrs = []
    for other, edge_data in G.adj[target].items():
        otier = _tier(G.nodes[other])
        nbrs.append(
            {
                "id": other,
                "relation": edge_data.get("relation"),
                "evidence_tier": otier,
                "leg": G.nodes[other].get("leg"),
                "targetProtein": G.nodes[other].get("targetProtein"),
            }
        )
    nbrs.sort(key=lambda r: -r["evidence_tier"])
    proven = [r for r in nbrs if r["evidence_tier"] >= 4]

    return {
        "ok": True,
        "target": target,
        "target_tier": _tier(G.nodes[target]),
        "degree": int(G.degree(target)),
        "neighbors": nbrs,
        "proven_neighbors": proven,
        "connected_to_proven": len(proven) > 0,
    }


@app.post("/kg/bridges")
def bridges(g: GraphIn, from_id: str, to_id: Optional[str] = None) -> dict[str, Any]:
    """Shortest paths from `from_id` to (a) `to_id`, or (b) the nearest proven hub.

    Gives a principled 'route to known-effective targets' readout instead of the
    shallow rule checks the TS verifier currently performs.
    """
    if not g.nodes:
        raise HTTPException(status_code=400, detail="no nodes supplied")
    G = _build_graph(g)
    if from_id not in G:
        raise HTTPException(status_code=400, detail=f"from_id '{from_id}' not in graph")

    def _paths(u: str, v: str, limit: int) -> list[list[str]]:
        try:
            return [list(p) for p in nx.all_shortest_paths(G, source=u, target=v)][:limit]
        except nx.NetworkXNoPath:
            return []

    if to_id:
        if to_id not in G:
            raise HTTPException(status_code=400, detail=f"to_id '{to_id}' not in graph")
        return {"ok": True, "from": from_id, "to": to_id, "paths": _paths(from_id, to_id, 5)}

    # Default: nearest proven (evidence_tier >= 4) reachable node via shortest path.
    proven = sorted(
        (nd for nd in G.nodes() if _tier(G.nodes[nd]) >= 4),
        key=lambda nd: _tier(G.nodes[nd]),
        reverse=True,
    )
    reached: list[dict[str, Any]] = []
    unreachable = True
    if proven:
        for hub in proven:
            paths = _paths(from_id, hub, 3)
            if paths:
                reached.append({"hub": hub, "hub_tier": _tier(G.nodes[hub]), "paths": paths})
                unreachable = False
                break
    return {
        "ok": True,
        "from": from_id,
        "to_proven_hub": reached[0]["hub"] if reached else None,
        "reached_proven": not unreachable,
        "bridges": reached,
    }
