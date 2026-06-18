import json
import struct
import tempfile
import zipfile
from pathlib import Path

import h5py

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "public" / "models" / "lenet-5-emnist-balanced"
KERAS_PATH = MODEL_DIR / "model.keras"
BIN_PATH = MODEL_DIR / "weights.bin"
JSON_PATH = MODEL_DIR / "weights.json"

DATASETS = [
    ("conv1Kernel", "layers/conv2d/vars/0"),
    ("conv1Bias", "layers/conv2d/vars/1"),
    ("conv2Kernel", "layers/conv2d_1/vars/0"),
    ("conv2Bias", "layers/conv2d_1/vars/1"),
    ("dense1Kernel", "layers/dense/vars/0"),
    ("dense1Bias", "layers/dense/vars/1"),
    ("dense2Kernel", "layers/dense_1/vars/0"),
    ("dense2Bias", "layers/dense_1/vars/1"),
    ("dense3Kernel", "layers/dense_2/vars/0"),
    ("dense3Bias", "layers/dense_2/vars/1"),
]

LABELS = list("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") + list("abdefghnqrt")


def main() -> None:
    offset = 0
    manifest: dict[str, object] = {
        "source": "model.keras",
        "dtype": "float32",
        "byteOrder": "little-endian",
        "labels": LABELS,
        "tensors": {},
    }

    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(KERAS_PATH) as archive:
            archive.extract("model.weights.h5", directory)

        with h5py.File(Path(directory) / "model.weights.h5", "r") as h5, BIN_PATH.open("wb") as out:
            tensors = manifest["tensors"]
            assert isinstance(tensors, dict)
            for name, path in DATASETS:
                dataset = h5[path]
                values = dataset[()].astype("<f4", copy=False).ravel(order="C")
                out.write(values.tobytes())
                tensors[name] = {
                    "shape": list(dataset.shape),
                    "offset": offset,
                    "length": int(values.size),
                }
                offset += int(values.size)

    manifest["floatCount"] = offset
    manifest["byteLength"] = offset * struct.calcsize("<f")
    JSON_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
