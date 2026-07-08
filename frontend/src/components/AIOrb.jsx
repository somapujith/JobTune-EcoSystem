import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createOrbMaterial } from './aiOrb/orbShader';
import { createParticleTexture } from './aiOrb/particleTexture';

const PARTICLE_COUNT = 220;
const SPHERE_RADIUS = 1.4;

function buildParticles() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const speeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const radius = SPHERE_RADIUS * (1.05 + Math.random() * 0.25);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    speeds[i] = 0.05 + Math.random() * 0.1;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 0.045,
    map: createParticleTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color(0xcdb8ff),
  });

  return { points: new THREE.Points(geometry, material), speeds };
}

export default function AIOrb({ size, className }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 24);
    const material = createOrbMaterial();
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const { points, speeds } = buildParticles();
    scene.add(points);

    const resize = () => {
      const width = size ?? container.clientWidth;
      const height = size ?? container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let frameId;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      material.uniforms.uTime.value = elapsed;
      sphere.rotation.y = elapsed * 0.15;
      sphere.rotation.x = Math.sin(elapsed * 0.1) * 0.1;
      const pulse = 1 + Math.sin(elapsed * 0.6) * 0.03;
      sphere.scale.setScalar(pulse);

      points.rotation.y = elapsed * 0.08;
      const positions = points.geometry.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const idx = i * 3 + 2;
        positions[idx] += Math.sin(elapsed * speeds[i]) * 0.0006;
      }
      points.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      points.geometry.dispose();
      points.material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={size ? { width: size, height: size } : { width: '100%', height: '100%' }}
    />
  );
}
