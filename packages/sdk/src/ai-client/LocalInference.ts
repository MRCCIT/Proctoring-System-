/** WASM placeholder — wire ONNX/MediaPipe WASM when available */
export class LocalInference {
  async analyzeFrame(_imageDataUrl: string): Promise<{ violations: string[] }> {
    return { violations: [] };
  }
}
