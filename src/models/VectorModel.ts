export interface VectorMetadata {
  id: number;
  name: string;
}

export interface Vector {
  magnitude: number;
  vector: Float32Array;
}

export type VectorModel = Vector & VectorMetadata;