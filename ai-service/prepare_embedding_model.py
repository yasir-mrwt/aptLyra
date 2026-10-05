"""Explicit operator download; hash-checked pinned files, never invoked by HTTP."""
import argparse
import hashlib
from pathlib import Path
from urllib.request import urlopen

from app.services.embedding_runtime import manifest


def prepare(directory: Path, key: str) -> None:
    spec = manifest()["models"][key]
    directory.mkdir(parents=True, exist_ok=True)
    for filename, expected in spec["sha256"].items():
        target = directory / filename
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
            continue
        remote = "onnx/model.onnx" if filename == "model.onnx" else filename
        url = f'https://huggingface.co/{spec["id"]}/resolve/{spec["revision"]}/{remote}'
        temporary = target.with_suffix(".download")
        try:
            with urlopen(url, timeout=60) as response, temporary.open("wb") as output:
                size = 0
                while block := response.read(1024 * 1024):
                    size += len(block)
                    if size > 100_000_000:
                        raise ValueError("artifact_size_limit")
                    output.write(block)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
                raise ValueError("artifact_hash_mismatch")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    # Preserve the upstream license alongside downloaded weights.
    # Both pinned model cards declare Apache-2.0; neither repository ships LICENSE.
    with urlopen('https://www.apache.org/licenses/LICENSE-2.0.txt', timeout=30) as response:
        (directory / "LICENSE").write_bytes(response.read(100_000))
    (directory / "NOTICE").write_text(f'Embedding model: {spec["id"]}\nRevision: {spec["revision"]}\n'
                                    f'Model card / attribution: https://huggingface.co/{spec["id"]}\nLicense: Apache-2.0\n')
    print(f'Prepared {spec["id"]} at revision {spec["revision"]}; dimension 384')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--model", choices=list(manifest()["models"]), default=manifest()["selected"])
    args = parser.parse_args()
    service_root = Path(__file__).resolve().parent
    product_root = next((p for p in service_root.parents if (p / ".git").is_dir()
                         or ((p / "backend").is_dir() and (p / "frontend").is_dir())), service_root)
    if args.directory.resolve() == product_root or product_root in args.directory.resolve().parents:
        parser.error("Model directory must be outside the product repository")
    prepare(args.directory, args.model)
