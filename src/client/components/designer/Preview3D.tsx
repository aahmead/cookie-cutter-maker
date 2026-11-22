import { Maximize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  type BufferGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/client/components/ui/button";

/** A theme colour as RGB: draws the token once and reads the pixel back. */
function tokenColor(className: string): Color {
  const probe = document.createElement("span");
  probe.className = className;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new Color(r! / 255, g! / 255, b! / 255);
}

interface View {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  mesh: Mesh;
}

/** The model in 3D: drag to turn it, scroll or pinch to zoom. */
export function Preview3D({ geometry }: { geometry: BufferGeometry | null }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const framed = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = host.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new AmbientLight(0xffffff, 1.2));
    const key = new DirectionalLight(0xffffff, 2);
    key.position.set(1, -1.5, 2);
    scene.add(key);
    const material = new MeshStandardMaterial({
      color: tokenColor("text-primary"),
      roughness: 0.6,
      metalness: 0.05,
    });
    const mesh = new Mesh(undefined, material);
    scene.add(mesh);
    view.current = { renderer, scene, camera, controls, mesh };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = element;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.mesh.geometry = geometry ?? v.mesh.geometry;
    v.mesh.visible = geometry !== null;
    if (geometry) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      v.mesh.position.set(
        -(box.min.x + box.max.x) / 2,
        -(box.min.y + box.max.y) / 2,
        0,
      );
      if (!framed.current) {
        fit(v, geometry);
        framed.current = true;
      }
    }
  }, [geometry]);

  return (
    <div className="relative">
      <div
        ref={host}
        data-testid="preview-3d"
        className="h-80 w-full touch-none overflow-hidden rounded-lg border border-border bg-muted/40 md:h-96"
      />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          This browser can't show 3D. You can still download the model.
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="absolute top-3 right-3"
        data-testid="fit-view"
        disabled={!geometry}
        onClick={() => view.current && geometry && fit(view.current, geometry)}
      >
        <Maximize aria-hidden />
        Fit view
      </Button>
    </div>
  );
}

function fit(v: View, geometry: BufferGeometry) {
  geometry.computeBoundingSphere();
  const sphere: Sphere = geometry.boundingSphere!.clone();
  sphere.center.add(v.mesh.position);
  const distance =
    sphere.radius / Math.sin(((v.camera.fov / 2) * Math.PI) / 180);
  v.controls.target.copy(sphere.center);
  v.camera.position.set(
    sphere.center.x,
    sphere.center.y - distance * 0.75,
    sphere.center.z + distance * 0.65,
  );
  v.camera.near = distance / 100;
  v.camera.far = distance * 10;
  v.camera.updateProjectionMatrix();
  v.controls.update();
}
