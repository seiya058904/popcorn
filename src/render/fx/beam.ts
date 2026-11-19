import * as THREE from 'three';
import { globals } from '../core/globals.ts';

const vertex = /* glsl */ `
varying vec3 vWorld, vNormal;
varying float vAlong;
void main() {
  // The cone is built along +Y from 0 to 1.
  vAlong = position.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vWorld, vNormal;
varying float vAlong;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  // Brightest looking through the middle of the shaft, gone at its silhouette.
  float through = pow(abs(dot(normalize(vNormal), V)), 2.2);
  float fade = smoothstep(0.0, 0.06, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong));
  gl_FragColor = vec4(uColor * through * fade * uStrength, 0.0);
}
`;

const up = new THREE.Vector3(0, 1, 0);

/** A soft shaft of light in the air between two points. */
export function addLightBeam(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  color: THREE.ColorRepresentation,
  strength: number,
): THREE.Mesh {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radiusEnd / length, radiusStart / length, 1, 28, 1, true).translate(0, 0.5, 0);
  const material = new THREE.ShaderMaterial({
    name: 'light-beam',
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...globals, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    // Alpha holds the floor reflection mask, which light in the air must not touch.
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(up, direction.clone().normalize());
  mesh.scale.setScalar(length);
  mesh.renderOrder = 3;
  parent.add(mesh);
  return mesh;
}
