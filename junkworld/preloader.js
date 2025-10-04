(function () {
  // DOM elements for preloader UI
  const preloaderEl = document.getElementById('preloader');
  const percentEl = document.getElementById('preload-percent');
  const barFillEl = document.getElementById('preload-bar-fill');

  // If no preloader markup exists, expose a resolved promise and bail
  if (!preloaderEl || !percentEl || !barFillEl) {
    window.Preloader = {
      ready: Promise.resolve(),
      waitUntilReady(cb) {
        try { cb(); } catch (e) {}
      }
    };
    return;
  }

  // List of critical assets to preload before starting the game
  // Keep this minimal to avoid long startup delays.
  const CRITICAL_ASSETS = [
    'assets/hud/logo.png',
    'assets/character/idle.png',
    'assets/character/walk.png',
    'assets/tileset/land.png',
    'assets/tileset/Grass.png',
    // Small UI icons (lightweight, nice to have ready)
    'assets/icons/inventory.png',
    'assets/icons/gather.png',
    'assets/icons/bunker.png',
    'assets/icons/skills.png',
    'assets/icons/profile.png',
    'assets/icons/pets.png',
    'assets/icons/mailbox.png',
    'assets/icons/support.png',
    'assets/icons/logout.png'
  ];

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function updateProgress(k) {
    const pct = Math.round(clamp01(k) * 100);
    try {
      percentEl.textContent = pct + '%';
      barFillEl.style.width = pct + '%';
    } catch (e) {}
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => resolve({ url, ok: true });
        img.onerror = () => resolve({ url, ok: false });
        img.src = url;
      } catch (e) {
        resolve({ url, ok: false });
      }
    });
  }

  async function preloadAssets(urls, minDurationMs = 600) {
    const start = performance.now();
    const total = urls.length || 1;
    let loaded = 0;
    updateProgress(0);

    // Load sequentially to get smooth progress steps (these are small images)
    for (const url of urls) {
      // If browser cache already has it, onload resolves immediately
      await loadImage(url);
      loaded++;
      updateProgress(loaded / total);
    }

    // Ensure a minimum visible duration for nicer UX
    const elapsed = performance.now() - start;
    if (elapsed < minDurationMs) {
      await new Promise(r => setTimeout(r, minDurationMs - elapsed));
    }
  }

  function hidePreloader() {
    try {
      preloaderEl.classList.add('preloader--done');
      // Remove from DOM after CSS transition
      setTimeout(() => {
        if (preloaderEl && preloaderEl.parentNode) {
          preloaderEl.parentNode.removeChild(preloaderEl);
        }
      }, 500);
    } catch (e) {}
  }

  // Expose a promise that resolves when preloading finishes
  const readyPromise = (async () => {
    try {
      await preloadAssets(CRITICAL_ASSETS);
    } catch (e) {
      // ignore errors; proceed to start
    } finally {
      hidePreloader();
    }
  })();

  window.Preloader = {
    ready: readyPromise,
    waitUntilReady(cb) {
      try {
        readyPromise.then(() => { try { cb(); } catch (e) {} });
      } catch (e) {
        try { cb(); } catch (e2) {}
      }
    }
  };
})();
