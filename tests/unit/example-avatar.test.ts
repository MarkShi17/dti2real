import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

describe('fitexample-v1 fixture', () => {
  it('ships a deterministic rigged demo avatar with physical outfit meshes', async () => {
    const bytes = await readFile('public/avatar/examples/fitexample-v1/avatar.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const names: string[] = [];
    gltf.scene.traverse((object) => names.push(object.name));
    for (const name of ['example-sweater', 'example-trousers', 'example-bag', 'example-strap', 'example-flats', 'example-bob']) expect(names).toContain(name);
    for (const name of ['example-sweater', 'example-trousers', 'example-bag', 'example-strap', 'example-flats', 'example-bob']) {
      const mesh = gltf.scene.getObjectByName(name) as THREE.SkinnedMesh;
      expect(mesh?.isSkinnedMesh).toBe(true);
      expect(mesh.geometry.getAttribute('position')?.count).toBeGreaterThan(7);
      const weights = mesh.geometry.getAttribute('skinWeight');
      expect(weights?.count).toBe(mesh.geometry.getAttribute('position')?.count);
      const positions = mesh.geometry.getAttribute('position');
      const normals = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < weights.count; i++) {
        expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 4);
        expect([positions.getX(i), positions.getY(i), positions.getZ(i), normals.getX(i), normals.getY(i), normals.getZ(i)].every(Number.isFinite)).toBe(true);
      }
    }
    const influencedBones = (name: string) => {
      const mesh = gltf.scene.getObjectByName(name) as THREE.SkinnedMesh;
      const joints = mesh.geometry.getAttribute('skinIndex');
      return new Set(Array.from({ length: joints.count }, (_, vertex) => mesh.skeleton.bones[joints.getX(vertex)].name));
    };
    expect((gltf.scene.getObjectByName('example-sweater') as THREE.Mesh).geometry.getAttribute('position').count).toBeGreaterThan(1000);
    expect((gltf.scene.getObjectByName('example-trousers') as THREE.Mesh).geometry.getAttribute('position').count).toBeGreaterThan(500);
    expect([...influencedBones('example-sweater')].some(name => /upperarm|lowerarm/.test(name))).toBe(true);
    expect([...influencedBones('example-trousers')].some(name => /upperleg|lowerleg/.test(name))).toBe(true);
    expect(influencedBones('example-bob')).toContain('head');
    const strap = gltf.scene.getObjectByName('example-strap') as THREE.SkinnedMesh;
    const strapPosition = strap.geometry.getAttribute('position');
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < strapPosition.count; i++) { minX = Math.min(minX, strapPosition.getX(i)); maxX = Math.max(maxX, strapPosition.getX(i)); }
    expect(minX).toBeLessThan(-.1); expect(maxX).toBeGreaterThan(.1);
    const source = JSON.parse(await readFile('public/avatar/examples/fitexample-v1/SOURCES.json', 'utf8'));
    expect(source.files['avatar.glb'].sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(source.provenance.reference).toBe('docs/dti_example/fitEXAMPLE.png');
  });
});

import { coveredByExampleClothing } from '@/lib/avatar/example-outfit';
it('masks covered torso and legs while preserving the exposed left shoulder and every hand', () => {
  expect(coveredByExampleClothing([.1, .45, .04])).toBe(true);
  expect(coveredByExampleClothing([-.08, 1.23, -.07])).toBe(true);
  expect(coveredByExampleClothing([.16, 1.28, .08])).toBe(false);
  expect(coveredByExampleClothing([-.1, .87, .2], true)).toBe(false);
});
