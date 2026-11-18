"""Replay immutable demo inputs. Write draft archives and one JSON result per seed."""

import argparse
import gzip
import hashlib
import json
from pathlib import Path
from time import perf_counter

from app.scheduling.solver import generate
from app.scheduling.template import derive_template, expand_template
from app.scheduling.validation import validate
from scripts.timetable_metrics import measure_draft
from scripts.verify_template import signature


def benchmark(entry, seed, seconds, directory):
    snapshot = entry["snapshot"]
    started = perf_counter()
    result = generate(snapshot, algorithm="cp_sat", seed=seed, seconds=seconds)
    elapsed = perf_counter() - started
    assignments = result["assignments"]
    draft = directory / f"{entry['group']}-seed-{seed}.json"
    draft.write_text(
        json.dumps({"snapshot": snapshot, "assignments": assignments}), encoding="utf-8"
    )
    saved = json.loads(draft.read_text(encoding="utf-8"))
    metrics = measure_draft(saved["snapshot"], saved["assignments"])
    validation = validate(snapshot, assignments)
    occurrences = {o["id"]: o["component_id"] for o in snapshot["occurrences"]}
    components = {c["id"]: c for c in snapshot["workloads"]}
    rows = [
        {
            **components[occurrences[a["occurrence_id"]]],
            **a,
            "component_id": occurrences[a["occurrence_id"]],
        }
        for a in assignments
    ]
    calendar = {
        **snapshot["calendar"],
        "periods": snapshot["periods"],
        "disruptions": snapshot.get("disruptions", []),
        "overrides": snapshot.get("overrides", []),
    }
    args = snapshot["term"], snapshot["holidays"], calendar
    exact = signature(rows) == signature(
        expand_template(derive_template(rows, *args), *args)
    )
    return {
        "group": entry["group"],
        "seed": seed,
        "search_seconds": seconds,
        "wall_seconds": round(elapsed, 3),
        "preparation_seconds": round(result["preparation_seconds"], 3),
        "solver_status": result["status"],
        "occurrences": len(occurrences),
        "unplaced": len(validation["unplaced_occurrences"]),
        "issues": validation["issues"],
        "exact_template_roundtrip": exact,
        "metrics": metrics,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--seconds", type=int, default=60)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    payload = gzip.decompress(args.inputs.read_bytes())
    runs = []
    for entry in json.loads(payload):
        row = benchmark(entry, args.seed, args.seconds, args.directory)
        runs.append(row)
        print(
            entry["group"],
            row["seed"],
            row["wall_seconds"],
            row["unplaced"],
            flush=True,
        )
    output = {"input_sha256": hashlib.sha256(payload).hexdigest(), "runs": runs}
    (args.directory / f"seed-{args.seed}.json").write_text(
        json.dumps(output, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
