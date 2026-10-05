# Embedding model decision — Phase 5

## CURRENTLY IMPLEMENTED

Select `sentence-transformers/paraphrase-MiniLM-L3-v2`, revision
`4ca70771034acceecb2e72475f72050fcdde4ddc`, 384 dimensions, masked mean pooling
and L2 normalization, embedding version `onnx-mean-l2-v1`. CPU ONNX inference has
no per-query provider exposure, quota, GPU requirement or provider fee. The model
is used as a small semantic encoder, not an authority about technical correctness.

The shortlist was evaluated against the unchanged approved 48-question corpus and
32 manually specified development queries, four per root. Queries and expected
stable publication keys were defined before measurements. Both encoders used their
published ONNX weights, tokenizer, native token budget, masked mean and L2, two
intra-op CPU threads / one inter-op thread. No quantization or fake vectors were
used. The benchmark is reproducible with `ai-service/benchmark_embeddings.py`.

| Model | ONNX size | Unfiltered expected top 1 | Expected top 5 | Query CPU median / p95 ms | Encoder initialization median / p95 ms |
|---|---:|---:|---:|---:|---:|
| paraphrase-MiniLM-L3-v2 | 69.04 MB | 29/32 | 32/32 | 6.820 / 7.204 | 516.140 / 971.741 |
| all-MiniLM-L6-v2 | 90.41 MB | 30/32 | 32/32 | 13.407 / 14.514 | 456.614 / 658.451 |

The three-layer model is smaller and about twice as fast on query computation,
while matching top-five presence. The six-layer alternative improves top-one
presence by one question in this set. This difference has no established
statistical significance. We prefer the smaller option for the preparatory corpus.
The model is not tuned on a Phase 11 held-out set. Detailed measurements and pinned
artifact checksums are in [the shortlist artifact](embedding-model-benchmark.json).

## Operations and limitations

The model/tokenizer are downloaded only by an explicit operator command at fixed
revisions, checksum-verified on preparation and loading, and cached outside Git.
HTTP requests never download models or choose a model. Artifacts are approximately
69 MB plus 0.47 MB tokenizer; runtime packages add NumPy, ONNX Runtime, tokenizers
and pinned new transitive dependencies. This avoids a Torch installation but still
requires budgeting process memory and disk separately from model-file size.

The selected model allows 128 wordpieces including special tokens. Oversized input
is rejected rather than silently truncated. Future reviewed technical references
must have suitable bounded chunks; current seed questions fit this budget. The
runtime accepts at most 16 texts / 4000 characters each, with a separate byte limit.
CPU means no GPU driver is needed; application downloads and requests are separate.

Measurements ran in Linux ARM64 Docker/Python 3.11 on an Apple M1 macOS host,
not native macOS Python or Windows. Official wheel metadata confirms Python 3.11
macOS ARM64, Windows x64 and Linux ARM64 runtime wheels, and matching tokenizer
platform wheels. Windows performance, native Mac performance, deployment memory,
concurrent throughput and cloud PostgreSQL latency remain unmeasured. A small CPU
service with externally mounted artifacts is feasible, not a deployment guarantee.
No cloud database, live embedding provider or production migration was used.

Both model cards declare Apache-2.0. Preparation retains the Apache license text
and a NOTICE linking the exact model/revision. Upstream notices in dependencies
remain intact. Sources: [L3 model card](https://huggingface.co/sentence-transformers/paraphrase-MiniLM-L3-v2),
[L6 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
[ONNX Runtime installation](https://onnxruntime.ai/docs/install/),
[pinned runtime wheel metadata](https://pypi.org/pypi/onnxruntime/1.23.2/json),
[pinned tokenizer metadata](https://pypi.org/pypi/tokenizers/0.22.2/json).
