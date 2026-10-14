"""QEM（二次误差度量）边折叠抽稀：替换顶点聚类。
保拓扑、误差驱动——平面区域先塌陷、曲面区域保留细节。
"""
import heapq
import numpy as np


def weld_vertices(V, F, decimals=6):
    """精确焊接重复顶点（STL 常含重复坐标）。"""
    key = np.round(V, decimals)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return V[idx], inv[F].astype(np.int64)


def face_quadrics(V, F):
    """面积加权平面 quadric：Q = area * (a b c d)^T (a b c d)。"""
    p0, p1, p2 = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(p1 - p0, p2 - p0)
    ln = np.linalg.norm(n, axis=1)
    ln[ln < 1e-16] = 1e-16
    n = n / ln[:, None]
    area = ln * 0.5
    d = -np.einsum("ij,ij->i", n, p0)
    plane = np.concatenate([n, d[:, None]], axis=1)  # (m,4)
    Q = np.einsum("ij,ik->ijk", plane, plane) * area[:, None, None]
    return Q  # (m,4,4)


def qem_decimate(V, F, target_faces, boundary_guard=True):
    V = np.asarray(V, dtype=np.float64)
    F = np.asarray(F, dtype=np.int64)
    faces = [tuple(f) for f in F]
    verts = V.copy()

    # 每个顶点的 quadric = 相邻面 quadric 之和
    vq = np.zeros((len(verts), 4, 4))
    fq = face_quadrics(verts, np.asarray(faces))
    for fi, f in enumerate(faces):
        for v in f:
            vq[v] += fq[fi]

    # 顶点 -> 入射面
    v2f = {}
    for fi, f in enumerate(faces):
        for v in f:
            v2f.setdefault(v, []).append(fi)

    # 边集合（manifold：内部边属于 2 个面；boundary 边 1 个面时跳过折叠）
    edge_faces = {}
    for fi, (a, b, c) in enumerate(faces):
        for e in ((a, b), (b, c), (c, a)):
            key = (min(e), max(e))
            edge_faces.setdefault(key, []).append(fi)

    def cost(v_keep, v_del):
        Q = vq[v_keep] + vq[v_del]
        p = np.append(verts[v_keep], 1.0)
        return float(p @ Q @ p)

    heap = []
    for (a, b), fl in edge_faces.items():
        if boundary_guard and len(fl) < 2:
            continue
        ca, cb = cost(a, b), cost(b, a)
        if ca <= cb:
            heapq.heappush(heap, (ca, a, b))
        else:
            heapq.heappush(heap, (cb, b, a))

    alive = np.ones(len(faces), dtype=bool)
    removed_v = np.zeros(len(verts), dtype=bool)
    n_faces = len(faces)

    def normal_dir(fi):
        if not alive[fi]:
            return None
        a, b, c = faces[fi]
        p0, p1, p2 = verts[a], verts[b], verts[c]
        n = np.cross(p1 - p0, p2 - p0)
        ln = np.linalg.norm(n)
        return n / ln if ln > 1e-14 else None

    while heap and n_faces > target_faces:
        c, v_keep, v_del = heapq.heappop(heap)
        if removed_v[v_keep] or removed_v[v_del]:
            continue
        if c > 1e18:
            continue
        # 翻转检查：折叠后相邻面法线不得反向
        ok = True
        for fi in v2f.get(v_del, []):
            if not alive[fi]:
                continue
            n0 = normal_dir(fi)
            if n0 is None:
                continue
            a, b, cc = faces[fi]
            nf = tuple(v_keep if x == v_del else x for x in (a, b, cc))
            if len(set(nf)) < 3:
                continue
            p0, p1, p2 = verts[nf[0]], verts[nf[1]], verts[nf[2]]
            nn = np.cross(p1 - p0, p2 - p0)
            ln = np.linalg.norm(nn)
            if ln < 1e-14:
                continue
            if float(np.dot(nn / ln, n0)) <= 0:
                ok = False
                break
        if not ok:
            continue
        # 执行折叠：v_del 的所有面改指向 v_keep
        for fi in v2f.get(v_del, []):
            if not alive[fi]:
                continue
            a, b, cc = faces[fi]
            nf = tuple(v_keep if x == v_del else x for x in (a, b, cc))
            if len(set(nf)) < 3:
                alive[fi] = False
                n_faces -= 1
                continue
            faces[fi] = nf
            v2f.setdefault(v_keep, []).append(fi)
        removed_v[v_del] = True
        vq[v_keep] += vq[v_del]
        # v_keep 位置更新到误差最优（简化：保持原位；quadric 已吸收）

    keep_faces = [f for fi, f in enumerate(faces) if alive[fi]]
    used = sorted({v for f in keep_faces for v in f})
    remap = {v: i for i, v in enumerate(used)}
    newV = verts[used]
    newF = np.asarray([[remap[v] for v in f] for f in keep_faces], dtype=np.int64)
    return newV, newF


def read_stl(path):
    import struct
    data = path.read_bytes()
    n = struct.unpack("<I", data[80:84])[0]
    dt = np.dtype([("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")])
    arr = np.frombuffer(data, dtype=dt, count=n, offset=84)
    return arr["v"].reshape(-1, 3).astype(np.float64).copy(), np.arange(n * 3, dtype=np.int64).reshape(n, 3)


def write_stl(path, verts, faces):
    out = np.zeros((faces.shape[0], 3, 3), dtype="<f4")
    out[:, 0, :] = verts[faces[:, 0]]
    out[:, 1, :] = verts[faces[:, 1]]
    out[:, 2, :] = verts[faces[:, 2]]
    with open(path, "wb") as f:
        f.write(b"\0" * 80)
        f.write(struct.pack("<I", faces.shape[0]))
        rec = np.zeros(faces.shape[0], dtype=[("n", "<f4", (3,)), ("v", "<f4", (3, 3)), ("a", "<u2")])
        rec["v"] = out
        f.write(rec.tobytes())


import struct  # noqa: E402
