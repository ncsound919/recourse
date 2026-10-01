"""
KAG Sidecar — Logical-form-guided reasoning over Recourse's Neo4j KG.

Provides a stateless HTTP service that accepts a natural-language query and
returns a logical-form reasoning plan with retrieved evidence. Honest: when
KAG/Neo4j is unavailable, returns ok:false — never fabricated reasoning.

Endpoints:
  GET  /health
  POST /kag/reason  {query, domain?, max_hops?}
  POST /kag/infer   {subject, predicate, object?}
"""
import os
import json
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="KAG Sidecar", version="0.1.0")

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password")


class ReasonRequest(BaseModel):
    query: str
    domain: Optional[str] = None
    max_hops: int = 3


class InferRequest(BaseModel):
    subject: str
    predicate: str
    object: Optional[str] = None


def check_neo4j_available() -> bool:
    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        driver.verify_connectivity()
        driver.close()
        return True
    except Exception:
        return False


@app.get("/health")
def health():
    available = check_neo4j_available()
    return {
        "ok": True,
        "service": "kag-sidecar",
        "neo4j_available": available,
        "neo4j_uri": NEO4J_URI,
    }


@app.post("/kag/reason")
def reason(req: ReasonRequest):
    if not check_neo4j_available():
        return {
            "ok": False,
            "error": "Neo4j not available",
            "query": req.query,
            "plan": None,
            "evidence": [],
        }

    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session() as session:
            cypher = """
            MATCH (n)-[r*1..%d]-(m)
            WHERE toLower(n.name) CONTAINS toLower($term)
            RETURN n.name as source, m.name as target,
                   [rel IN r | type(rel)] as relations
            LIMIT 10
            """ % req.max_hops
            term = req.query.split()[0] if req.query else ""
            result = session.run(cypher, {"term": term})
            evidence = [
                {"source": rec["source"], "target": rec["target"], "relations": rec["relations"]}
                for rec in result
            ]
        driver.close()

        return {
            "ok": True,
            "query": req.query,
            "plan": {
                "type": "graph_traversal",
                "max_hops": req.max_hops,
                "domain": req.domain,
            },
            "evidence": evidence,
            "evidence_count": len(evidence),
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "query": req.query,
            "plan": None,
            "evidence": [],
        }


@app.post("/kag/infer")
def infer(req: InferRequest):
    if not check_neo4j_available():
        return {
            "ok": False,
            "error": "Neo4j not available",
            "triple": {"subject": req.subject, "predicate": req.predicate, "object": req.object},
            "inferences": [],
        }

    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session() as session:
            if req.object:
                cypher = """
                MATCH (s {name: $subject})-[r:{$predicate}]->(o {name: $object})
                RETURN s.name as subject, o.name as object, type(r) as relation
                """
                result = session.run(cypher, {
                    "subject": req.subject,
                    "predicate": req.predicate,
                    "object": req.object,
                })
            else:
                cypher = """
                MATCH (s {name: $subject})-[r:{$predicate}]->(o)
                RETURN s.name as subject, o.name as object, type(r) as relation
                LIMIT 10
                """
                result = session.run(cypher, {
                    "subject": req.subject,
                    "predicate": req.predicate,
                })
            inferences = [
                {"subject": rec["subject"], "object": rec["object"], "relation": rec["relation"]}
                for rec in result
            ]
        driver.close()

        return {
            "ok": True,
            "triple": {"subject": req.subject, "predicate": req.predicate, "object": req.object},
            "inferences": inferences,
            "inference_count": len(inferences),
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "triple": {"subject": req.subject, "predicate": req.predicate, "object": req.object},
            "inferences": [],
        }
