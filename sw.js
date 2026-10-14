// Service Worker：静态资产全缓存，二次访问零等待（PWA + GitHub Pages）。
// 策略：安装时预缓存应用外壳；请求时 cache-first，命中则直接返回，
// 未命中走网络并回填缓存。wasm/权重/STL 等大文件同样缓存（首次后不再下载）。
const CACHE = "wheelleg-sim-v1";
const SHELL = [
  "./",
  "./index.html",
  "./playground.html",
  "./404.html",
  "./manifest.json",
  "./assets/css/site.css",
  "./assets/css/lain-playground.css",
  "./assets/js/app.js",
  "./assets/js/engine.js",
  "./assets/js/render.js",
  "./assets/js/policy.js",
  "./assets/js/contract.js",
  "./assets/js/utils.js",
  "./assets/js/obs/observation_builders.js",
  "./assets/vendor/mujoco/mujoco.js",
  "./assets/vendor/mujoco/mujoco.wasm",
  "./assets/vendor/three/three.module.js",
  "./assets/vendor/three/OrbitControls.js",
  "./assets/models/wheelleg_web.xml",
  "./assets/models/scene_flat.xml",
  "./assets/models/scene_stairs.xml",
  "./assets/models/scene_rough.xml",
  "./assets/models/scene_wall.xml",
  "./assets/models/meshes.json",
  "./assets/models/weights/model_6800.bin",
  "./assets/models/weights/model_84.bin",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match("./playground.html"));
    }),
  );
});
