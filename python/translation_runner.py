"""
Stateless runner for the Overlay Science translation engines (BB-Tech
basketball->biotech, golf-surgery). Recourse spawns this process, writes ONE
JSON command to stdin, and reads ONE JSON result from stdout.

The engine module is loaded from the REAL sibling repo path via importlib —
Recourse never reimplements or fabricates a translation; whatever the engine
computes is what comes back. A failure to import/run reports ok:false with the
real error.
"""

import importlib.util
import json
import sys


def load_class(module_file: str, class_name: str):
    spec = importlib.util.spec_from_file_location("recourse_translation_engine", module_file)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load module: {module_file}")
    mod = importlib.util.module_from_spec(spec)
    # Register BEFORE exec so @dataclass (used by golf_surgery) can resolve
    # the module's own namespace via sys.modules. Standard importlib pattern.
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod, getattr(mod, class_name)


def result_row(r) -> dict:
    return {
        "source_term": r.source_term,
        "target_term": r.target_term,
        "direction": r.direction.value,
        "confidence": r.confidence,
        "description": r.description,
        "domain": r.domain.value,
        "bidirectional_possible": r.bidirectional_possible,
    }


def main() -> None:
    raw = sys.stdin.read()
    try:
        cmd = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"bad command: {e}"}))
        return

    try:
        mod, cls = load_class(cmd["module_file"], cmd["class_name"])
        engine = cls()
        op = cmd.get("op")

        if op == "health":
            st = engine.get_statistics()
            print(json.dumps({"ok": True, **st}))

        elif op == "translate_term":
            direction = (
                mod.TranslationDirection.FORWARD
                if cmd.get("direction", "forward") == "forward"
                else mod.TranslationDirection.REVERSE
            )
            res = engine.translate(str(cmd.get("term", "")), direction)
            print(json.dumps({"ok": True, **result_row(res)}))

        elif op == "translate_metric":
            metric = str(cmd.get("metric", ""))
            value = float(cmd.get("value", 0))
            from_source = bool(cmd.get("from_source", True))
            out = engine.translate_metric(metric, value, from_source)
            if isinstance(out, dict) and "error" in out:
                print(json.dumps({"ok": False, "error": out["error"]}))
            else:
                print(json.dumps({"ok": True, "result": out}))

        elif op == "similar":
            direction = (
                mod.TranslationDirection.FORWARD
                if cmd.get("direction", "forward") == "forward"
                else mod.TranslationDirection.REVERSE
            )
            rows = engine.get_similar_terms(str(cmd.get("term", "")), direction, int(cmd.get("max_results", 5)))
            print(json.dumps({"ok": True, "results": [result_row(r) for r in rows]}))

        else:
            print(json.dumps({"ok": False, "error": f"unknown op: {op}"}))

    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    main()