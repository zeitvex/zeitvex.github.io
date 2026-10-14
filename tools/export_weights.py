"""导出比赛策略 ONNX 的权重为紧凑 binary（供 JS 手写推理）。
图结构（两策略相同）： obs -> (x-0)/1 -> Gemm53x512 -> Elu -> Gemm512x256 -> Elu
-> Gemm256x128 -> Elu -> Gemm128x16 -> action
"""
import json
import struct
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper

MODELS = Path(r"C:\Users\31560\Documents\00_open\zeitvex.github.io\assets\models")
OUT = MODELS / "weights"
OUT.mkdir(exist_ok=True)

DIMS = [53, 512, 256, 128, 16]
LAYERS = [
    ("net.0.weight", "net.0.bias"),
    ("net.2.weight", "net.2.bias"),
    ("net.4.weight", "net.4.bias"),
    ("net.6.weight", "net.6.bias"),
]

manifest = {"dims": DIMS, "policies": {}}

for name in ["model_6800", "model_84"]:
    m = onnx.load(str(MODELS / f"{name}.onnx"))
    inits = {i.name: numpy_helper.to_array(i) for i in m.graph.initializer}
    mean = inits.get("obs_mean")
    std = inits.get("obs_std")
    if mean is not None and np.abs(mean).max() > 1e-8:
        raise SystemExit(f"{name}: obs_mean 非零，需在 JS 侧实现归一化")
    if std is not None and np.abs(std - 1).max() > 1e-8:
        raise SystemExit(f"{name}: obs_std 非 1，需在 JS 侧实现归一化")
    blobs = []
    for wn, bn in LAYERS:
        w = inits[wn].astype(np.float32).reshape(-1)
        b = inits[bn].astype(np.float32).reshape(-1)
        blobs.append(w.tobytes())
        blobs.append(b.tobytes())
    data = b"".join(blobs)
    (OUT / f"{name}.bin").write_bytes(data)
    manifest["policies"][name] = {
        "file": f"weights/{name}.bin",
        "bytes": len(data),
        "params": sum(len(inits[wn].reshape(-1)) + len(inits[bn].reshape(-1)) for wn, bn in LAYERS),
    }
    print(f"{name}: {len(data)} bytes, {manifest['policies'][name]['params']} params")

(MODELS / "weights.json").write_text(json.dumps(manifest, indent = 1))
print("weights.json written")
