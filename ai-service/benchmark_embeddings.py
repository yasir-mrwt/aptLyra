"""Reproducible real-model development shortlist; never writes vectors to Git."""
import argparse
import json
import platform
import statistics
import time
from pathlib import Path

import numpy as np
from app.services.embedding_runtime import CpuEncoder, manifest


def summary(values):
    return {"medianMs": round(statistics.median(values), 3),
            "p95Ms": round(float(np.percentile(values, 95)), 3)}


def run(cache, product):
    docs = json.loads((product / "backend/data/ingestion/junior-se-seed.json").read_text())["documents"]
    labels = json.loads((product / "backend/data/retrieval/development-queries.json").read_text())["queries"]
    results = []
    for key, spec in manifest()["models"].items():
        loads = []
        for _ in range(3):
            start = time.perf_counter()
            encoder = CpuEncoder(cache / key, spec)
            loads.append((time.perf_counter() - start) * 1000)
        vectors = []
        for offset in range(0, len(docs), 16):
            vectors.extend(encoder.encode([d["questions"][0]["text"] for d in docs[offset:offset + 16]]))
        corpus = np.array(vectors)
        times, ranks, filtered, scores = [], [], [], []
        for label in labels:
            for iteration in range(4):
                start = time.perf_counter()
                vector = encoder.encode([label["query"]])[0]
                times.append((time.perf_counter() - start) * 1000)
                if iteration == 0:
                    similarities = corpus @ vector
                    order = np.argsort(-similarities)
                    relevant = {i for i, d in enumerate(docs) if d["key"] in label["expectedKeys"]}
                    rank = min(list(order).index(i) + 1 for i in relevant)
                    root_order = [i for i in order if docs[i]["key"].split(".")[0] == label["root"]]
                    ranks.append(rank)
                    filtered.append(min(root_order.index(i) + 1 for i in relevant))
                    scores.append(float(max(similarities[i] for i in relevant)))
        results.append({"key": key, "model": spec, "onnxBytes": (cache / key / "model.onnx").stat().st_size,
                        "queryCount": len(labels), "hitRateAt1": sum(r == 1 for r in ranks) / len(ranks),
                        "hitRateAt5": sum(r <= 5 for r in ranks) / len(ranks),
                        "rootFilteredHitRateAt5": sum(r <= 5 for r in filtered) / len(filtered),
                        "minimumExpectedSimilarity": min(scores), "ranks": ranks,
                        "queryEmbedding": summary(times), "modelLoad": summary(loads)})
    print(json.dumps({"environment": platform.platform(), "threads": 2, "results": results}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--product", type=Path, required=True)
    args = parser.parse_args()
    run(args.cache, args.product)
