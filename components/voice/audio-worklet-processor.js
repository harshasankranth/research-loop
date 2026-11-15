class PcmProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) this.buf.push(ch[i]);
    while (this.buf.length >= 6144) {
      const chunk = this.buf.splice(0, 6144);
      // Downsample 48k → 16k (every 3rd sample), then PCM16
      const out = new Int16Array(Math.floor(chunk.length / 3));
      for (let i = 0; i < out.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i * 3]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
