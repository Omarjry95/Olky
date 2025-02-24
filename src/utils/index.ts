export function accumulateVectorsProducts(v1: Float32Array, v2?: Float32Array): number {
  let acc = 0;

  for (let i = 0; i < v1.length; i++) {
    acc += v1[i] * (v2 ? v2[i] : v1[i]);
  }

  return acc;
}