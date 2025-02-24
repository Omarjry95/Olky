export interface KDNode {
  id: number,
  magnitude: number,
  vector: Float32Array,
  leftNode: KDNode | null,
  rightNode: KDNode | null,
}

export interface KDNodeDistance {
  node: KDNode | null,
  distance: number,
  depth: number
}