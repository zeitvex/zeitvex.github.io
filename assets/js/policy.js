// JS 手写策略推理：与比赛 ONNX 逐位对拍的 Gemm+ELU MLP。
// 权重由 tools/export_weights.py 从 model_6800/model_84 ONNX 导出，
// 图结构 obs -> Gemm(53,512) -> Elu -> Gemm(512,256) -> Elu -> Gemm(256,128)
//        -> Elu -> Gemm(128,16) -> action；ONNX 内归一化为恒等（mean=0/std=1）。
const DIMS = [53, 512, 256, 128, 16];

export class JsPolicy {
  constructor(buffer) {
    // 兼容 ArrayBuffer / TypedArray / Node Buffer（Buffer 是 Uint8Array 视图，
    // 直接 new Float32Array(buf) 会把每个字节当成一个元素——必须切出其底层
    // ArrayBuffer 并按 float32 重新解释）。
    let ab;
    if (buffer instanceof ArrayBuffer) {
      ab = buffer;
    } else if (ArrayBuffer.isView(buffer)) {
      ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } else {
      throw new TypeError("JsPolicy 需要 ArrayBuffer 或 TypedArray");
    }
    this.w = [];
    this.b = [];
    const f = new Float32Array(ab);
    let off = 0;
    for (let l = 0; l < 4; l += 1) {
      const nIn = DIMS[l], nOut = DIMS[l + 1];
      this.w.push(f.subarray(off, off + nOut * nIn));
      off += nOut * nIn;
      this.b.push(f.subarray(off, off + nOut));
      off += nOut;
    }
    this.h0 = new Float32Array(512);
    this.h1 = new Float32Array(256);
    this.h2 = new Float32Array(128);
    this.out = new Float32Array(16);
  }

  static gemm(x, w, b, nIn, nOut, out) {
    for (let o = 0; o < nOut; o += 1) {
      const row = o * nIn;
      let s = b[o];
      for (let i = 0; i < nIn; i += 1) s += w[row + i] * x[i];
      out[o] = s;
    }
  }

  static elu(v) {
    for (let i = 0; i < v.length; i += 1) {
      const x = v[i];
      if (x < 0) v[i] = Math.exp(x) - 1;
    }
    return v;
  }

  /** @returns {Float32Array} 16 维原始动作 */
  run(obs) {
    JsPolicy.gemm(obs, this.w[0], this.b[0], 53, 512, this.h0);
    JsPolicy.elu(this.h0);
    JsPolicy.gemm(this.h0, this.w[1], this.b[1], 512, 256, this.h1);
    JsPolicy.elu(this.h1);
    JsPolicy.gemm(this.h1, this.w[2], this.b[2], 256, 128, this.h2);
    JsPolicy.elu(this.h2);
    JsPolicy.gemm(this.h2, this.w[3], this.b[3], 128, 16, this.out);
    return this.out;
  }
}
