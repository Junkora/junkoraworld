/* Junkora (Real-time growth)
   2D top-down, grid-based farming sim built with Canvas
   Day system removed. Crops now grow in real-time while watered.
   Features:
   - Tileset-based world map (grid) with decorations
   - Player movement (WASD/Arrow keys)
   - Tools: Hoe, Watering Can, Hand/Harvest
   - Crop system: seed -> sprout -> mature (harvestable), real-time progression
   - Hidden per-tile coordinates (debug toggle via F3 only)
   - Inventory: seeds and harvested crops
   - Shop: buy seeds, sell crops
   - Expandable architecture for future systems
*/

// ----------------------------- Constants & Config -----------------------------

const TILE_SIZE = 32;                // pixels per tile
const WORLD_W = 256;                 // tiles (10x area from 64 → 256)
const WORLD_H = 120;                 // tiles (10x area from 48 → 120)
const MOVE_COOLDOWN_MS = 120;        // grid movement cadence
const SAVE_KEY = 'junkora-save-v1'; // bump key to avoid stale day fields
const WATER_DURATION_MS = 60000;     // water lasts 60s (re-water to extend)
const AUTOSAVE_INTERVAL_MS = 5000;   // autosave every 5s

const DECOR_PROXIMITY = 8;  // proximity for full animation (Manhattan tiles)
const GATHER_TIME_MS = 1500;       // milliseconds to complete a gather action

const KEYS = {
  Up: ['ArrowUp', 'KeyW'],
  Down: ['ArrowDown', 'KeyS'],
  Left: ['ArrowLeft', 'KeyA'],
  Right: ['ArrowRight', 'KeyD'],
  Interact: ['KeyE'],
  Shop: ['KeyB'],
  Grid: ['KeyG'],
  Debug: ['F3'],
  ToolHoe: ['Digit1'],
  ToolWater: ['Digit2'],
  ToolHand: ['Digit3'],
  Escape: ['Escape'],
};

const Tools = {
  Hoe: 'hoe',
  Water: 'water',
  Hand: 'hand',
};

const Dir = {
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
};

// A tiny deterministic PRNG so world decor is consistent across sessions
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Crop definitions (expandable)
// stageMs: time required (in ms) to progress from current stage to the next
const CROPS = {
  turnip: {
    display: 'Turnip',
    seedPrice: 10,
    sellPrice: 25,
    stageMs: [8000, 12000, 0], // seed->sprout:8s, sprout->mature:12s
    colors: ['#7a552e', '#7fc96b', '#4ea24d'],
  },
  wheat: {
    display: 'Wheat',
    seedPrice: 12,
    sellPrice: 20,
    stageMs: [12000, 18000, 0],
    colors: ['#7a552e', '#8bbf6f', '#d2b84c'],
  },
  corn: {
    display: 'Corn',
    seedPrice: 20,
    sellPrice: 40,
    stageMs: [16000, 22000, 0],
    colors: ['#7a552e', '#6bbf59', '#f1c40f'],
  },
};

// Tileset (base layer indices)
const TILE = {
  Grass: 0,
  Soil: 1,
  Path: 2,
  Water: 3,
};

const TILESET = [
  // Garbage-world palette (sickly, polluted tones)
  { id: TILE.Grass, name: 'grass', base: '#3f463c' }, // grimy moss/grass
  { id: TILE.Soil,  name: 'soil',  base: '#2f231a' }, // oily mud
  { id: TILE.Path,  name: 'path',  base: '#3b3b3f' }, // cracked asphalt
  { id: TILE.Water, name: 'water', base: '#2a5d4f' }, // toxic green-blue
];

// Character sprites
const walkImg = new Image();
walkImg.src = 'assets/character/walk.png';
let walkReady = false;
walkImg.onload = () => { walkReady = true; };

const idleImg = new Image();
idleImg.src = 'assets/character/idle.png';
let idleReady = false;
idleImg.onload = () => { idleReady = true; };

/* ----------------------------- Background Music ------------------------------ */
let __bgm = null;
function setupBGM() {
  try {
    if (__bgm) return;
    __bgm = new Audio('assets/audio/junkorabgm.mp3');
    __bgm.loop = true;       // repeatable
    __bgm.volume = 0.25;     // 25% volume
    __bgm.preload = 'auto';

    const start = () => {
      if (!__bgm) return;
      __bgm.play().catch(() => {});
    };
    // Start on first user gesture to satisfy autoplay policies
    window.addEventListener('click', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    window.addEventListener('touchstart', start, { once: true, passive: true });

    // Best-effort resume when page becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && __bgm && __bgm.paused) {
        __bgm.play().catch(() => {});
      }
    });
  } catch (e) {}
}
// ----------------------------- Game State ------------------------------------

const Game = {
  coins: 50,
  tool: Tools.Hoe,
  equippedSeed: null, // 'turnip' | 'wheat' | 'corn' | null

  // Inventory
  inv: {
    seeds: { turnip: 0, wheat: 0, corn: 0 },
    crops: { turnip: 0, wheat: 0, corn: 0 },
    // Gathered items legacy aggregate: itemName -> count (kept for tooltip/meta)
    items: {},
    // Gathered items by identity: key = `${name}__${rarity}__${quality}` -> count
    gitems: {},
    // Inventory panel page (1..3)
    panelPage: 1
  },

  // World grid (2D)
  world: null,

  // Decorations (tree/flower/rock) as separate entity layer (blocks movement for trees/rocks)
  decor: [],

  // Player
  player: {
    x: 0,
    y: 0,
    facing: Dir.Down,
    lastMoveAt: 0,
    animState: 'idle',
    animFrame: 0,
    animTime: 0,
  },

  // View
  camera: { x: 0, y: 0 }, // in pixels

  // Flags
  showGrid: false,
  showDebug: false,

  // Random generator
  rng: mulberry32(1337),

  // Gather state (UI + timer)
  gather: { active: false, target: null, startAt: 0, duration: GATHER_TIME_MS, progress: 0 },

  // Autosave accumulator
  _autosaveMs: 0,

  // Supabase sync state
  _lastCoordSyncAt: 0,
  _lastSyncedPos: { x: null, y: null },

  // Realtime presence: other players keyed by user_id -> { x, y, username, lastSeen }
  others: {},
  othersView: {}
};

// A tile record
function makeTile(x, y, baseId) {
  return {
    tileId: baseId,   // tileset id
    tilled: false,    // tilled soil for planting
    watered: false,   // water state
    waterEndAt: 0,    // timestamp (performance.now()) when watering expires
    plant: null,      // { type, stage, growthMs }
    coord: { x, y },  // hidden coordinates
    walkable: baseId !== TILE.Water, // water is not walkable
  };
}

// ----------------------------- Canvas Setup ----------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

// Tileset image (land.png) for non-grass tiles
const tilesetImg = new Image();
tilesetImg.src = 'assets/tileset/land.png';
let tilesetReady = false;
let tilesetCols = 1;
tilesetImg.onload = () => {
  tilesetReady = true;
  tilesetCols = Math.max(1, Math.floor(tilesetImg.width / TILE_SIZE));
};

// Grass tileset image (Grass.png, 176x112, 16x16 tiles: 11 cols x 7 rows)
const grassTilesetImg = new Image();
grassTilesetImg.src = 'assets/tileset/Grass.png';
let grassTilesetReady = false;
grassTilesetImg.onload = () => {
  grassTilesetReady = true;
};
const GRASS_TILE_SIZE = 16; // Source tile size
const GRASS_COLS = 11; // 176 / 16
const GRASS_ROWS = 7; // 112 / 16
// Map base tile ids to sprite indices within the tileset
const TILE_SPRITE_INDEX = {
  [TILE.Grass]: 0,
  [TILE.Soil]: 1,
  [TILE.Water]: 2,
  [TILE.Path]: 3, // retained for compatibility; not used after path removal
};

function resizeCanvas() {
  canvas.width = Math.floor(window.innerWidth);
  canvas.height = Math.floor(window.innerHeight);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ----------------------------- DOM Elements ----------------------------------

const elCoins = document.getElementById('coins');
const elInvSeeds = document.getElementById('inventorySeeds');
const elInvCrops = document.getElementById('inventoryCrops');
const elEquippedSeed = document.getElementById('equipped-seed');
const invBar = document.getElementById('inventory-bar');
const invPanel = document.getElementById('inventory-panel');
const invUI = document.getElementById('inventory-ui');
const invToggle = document.getElementById('inventory-toggle');

const btnShop = document.getElementById('btnShop');
const modalShop = document.getElementById('shopModal');
const shopBuyList = document.getElementById('shopBuyList');
const shopSellList = document.getElementById('shopSellList');
const btnCloseShop = document.getElementById('closeShop');

const toolButtons = document.querySelectorAll('.tool-btn');

const sidebar = document.getElementById('sidebar');
const sidebarButtons = document.querySelectorAll('.sidebar-btn');
const on = (el, evt, handler) => { if (el) el.addEventListener(evt, handler); };

sidebarButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    sidebarButtons.forEach(b => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  });
});

if (sidebarButtons[0]) {
  sidebarButtons[0].classList.add('active');
  sidebarButtons[0].setAttribute('aria-pressed', 'true');
}

/* ----------------------------- Sidebar Modals (Bunker/Skills/Profile/Pets) ----------------------------- */

const __modals = {
  bunker: document.getElementById('modal-bunker'),
  skills: document.getElementById('modal-skills'),
  profile: document.getElementById('modal-profile'),
  pets: document.getElementById('modal-pets'),
  claim: document.getElementById('modal-claim'),
  mailbox: document.getElementById('modal-mailbox'),
  support: document.getElementById('modal-support'),
  minimap: document.getElementById('modal-minimap'),
  logout: document.getElementById('modal-logout'),
  username: document.getElementById('modal-username'),
};

// Bunker assets manifest (from assets/bunker)
const BUNKER_ASSETS = [
  { name: 'Armory Bunker', src: 'assets/bunker/Armory Bunker.png' },
  { name: 'Bedroom Bunker', src: 'assets/bunker/Bedroom Bunker.png' },
  { name: 'Control Room Bunker', src: 'assets/bunker/Control Room Bunker.png' },
  { name: 'Hydroponics  Garden Bunker', src: 'assets/bunker/Hydroponics  Garden Bunker.png' },
  { name: 'Kitchen Bunker', src: 'assets/bunker/Kitchen Bunker.png' },
  { name: 'Medical Bay Bunker', src: 'assets/bunker/Medical Bay Bunker.png' },
  { name: 'Pantry Bunker', src: 'assets/bunker/Pantry Bunker.png' },
  { name: 'Workshop  Crafting Room Bunker', src: 'assets/bunker/Workshop  Crafting Room Bunker.png' },
];

function slugifyBunkerName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'bunker';
}

function updateBunkerModal() {
  try {
    const container = document.querySelector('#modal-bunker .bunker-types');
    if (!container) return;

    // Build dynamic bunker gallery
    container.innerHTML = '';
    BUNKER_ASSETS.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rust-card';
      const slug = slugifyBunkerName(item.name);
      btn.setAttribute('data-bunker', slug);
      btn.setAttribute('data-name', item.name);
      btn.setAttribute('aria-label', 'Select ' + item.name);
      btn.innerHTML = `
        <img class="bunker-thumb" src="${item.src}" alt="${item.name}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;pointer-events:none;" />
        <div class="card-title">${item.name}</div>
        <button type="button" class="claim-btn" aria-label="Claim ${item.name}" style="margin-top:8px;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,0,0,0.3);background:#1f6feb;color:#fff;font-weight:700;cursor:pointer;">Claim</button>
      `;
      container.appendChild(btn);
    });

    // Restore selected bunker from storage
    try {
      const saved = localStorage.getItem('junkora-bunker-type');
      if (saved) {
        const btn = container.querySelector('.rust-card[data-bunker="' + saved + '"]');
        if (btn) btn.classList.add('selected');
      }
    } catch (e) {}
  } catch (e) {}
}

function __closeModalEl(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
}

function __openModalEl(el) {
  if (!el) return;
  // Close others
  Object.values(__modals).forEach(m => __closeModalEl(m));
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
}

function openModal(id) {
  const key = typeof id === 'string' ? id.replace(/^modal-/, '') : id;
  const el = __modals[key] || document.getElementById(id);
  __openModalEl(el);
  if (key === 'profile') {
    try { updateProfileModal(); } catch (e) {}
  } else if (key === 'skills') {
    try { updateSkillsModal(); } catch (e) {}
  } else if (key === 'bunker') {
    try { updateBunkerModal(); } catch (e) {}
  }
}

function closeAllModals() {
  Object.values(__modals).forEach(m => __closeModalEl(m));
}

/* Confirmation modal utilities */
let __confirmState = null;
/**
 * Show a confirmation modal.
 * opts: { title, text, details, confirmLabel, cancelLabel }
 * Returns Promise<boolean>
 */
function showConfirmModal(opts = {}) {
  const modal = document.getElementById('modal-confirm');
  if (!modal) {
    const msg = (opts && (opts.text || opts.title)) ? (opts.text || opts.title) : 'ARE YOU SURE?';
    return Promise.resolve(window.confirm ? window.confirm(msg) : true);
  }
  const {
    title = 'Confirm',
    text = 'ARE YOU SURE?',
    details = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
  } = opts;

  const titleEl = document.getElementById('modal-confirm-title');
  const textEl = document.getElementById('confirm-text');
  const detEl = document.getElementById('confirm-details');
  const okBtn = document.getElementById('confirm-ok');
  const cancelBtn = document.getElementById('confirm-cancel');

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  if (detEl) detEl.textContent = details;
  if (okBtn) okBtn.textContent = confirmLabel;
  if (cancelBtn) cancelBtn.textContent = cancelLabel;

  return new Promise((resolve) => {
    const done = (val) => {
      try {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      } catch (e) {}
      if (okBtn) okBtn.removeEventListener('click', onOk);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdropOrClose, true);
      __confirmState = null;
      resolve(val);
    };
    const onOk = (e) => { e.preventDefault(); done(true); };
    const onCancel = (e) => { e.preventDefault(); done(false); };
    const onBackdropOrClose = (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close-modal') === 'modal-confirm') {
        e.preventDefault();
        done(false);
      }
    };

    __confirmState = { resolve: done };
    if (okBtn) okBtn.addEventListener('click', onOk);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdropOrClose, true);

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  });
}

function isHighTier(rarity, quality) {
  const r = String(rarity || '').toLowerCase();
  const q = String(quality || '').toLowerCase();
  const highRarity = r === 'legendary' || r === 'mythic' || r === 'godlike';
  const highQuality = q === 'pristine' || q === 'exquisite';
  return highRarity || highQuality;
}

function updateProfileModal() {
  try {
    const nameEl = document.getElementById('profile-username');
    const staEl = document.getElementById('profile-stamina');
    const cashEl = document.getElementById('profile-cash');
    const junkEl = document.getElementById('profile-junk');
    const adaEl = document.getElementById('profile-ada');
    const statusEl = document.getElementById('profile-status');
    const specEl = document.getElementById('profile-specialty');

    const stamina = (typeof Mechanics !== 'undefined' && Mechanics.stamina) ? Mechanics.stamina : (Game.stamina || { current: 0, max: 0 });
    const curr = (typeof Mechanics !== 'undefined' && Mechanics.currencies) ? Mechanics.currencies : (Game.currencies || { cash: 0, junk: 0, ada: 0 });
    const username = (Game && Game.username) || localStorage.getItem('junkora-username') || 'Wanderer';

    if (nameEl) nameEl.textContent = username;
    if (staEl) staEl.textContent = `${Math.round(stamina.current)}/${stamina.max}`;
    if (cashEl) cashEl.textContent = String(curr.cash ?? 0);
    if (junkEl) junkEl.textContent = String(curr.junk ?? 0);
    if (adaEl) adaEl.textContent = String(curr.ada ?? 0);
    if (statusEl && !window.JunkoraWallet) statusEl.textContent = '';
    if (specEl) specEl.textContent = '';
  } catch (e) {}
}

// Wire sidebar buttons
document.getElementById('btn-bunker')?.addEventListener('click', () => openModal('bunker'));
document.getElementById('btn-skills')?.addEventListener('click', () => openModal('skills'));
document.getElementById('btn-profile')?.addEventListener('click', () => openModal('profile'));
document.getElementById('btn-pets')?.addEventListener('click', () => openModal('pets'));

document.getElementById('btn-mailbox')?.addEventListener('click', () => openModal('mailbox'));
document.getElementById('btn-support')?.addEventListener('click', () => openModal('support'));
document.getElementById('btn-logout')?.addEventListener('click', () => startLogoutCountdown());
// Clickable minimap opens large map modal
document.getElementById('minimap')?.addEventListener('click', () => openModal('minimap'));

// Close via backdrop or close button
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target || !target.getAttribute) return;
  const id = target.getAttribute('data-close-modal');
  if (id) {
    const el = document.getElementById(id);
    __closeModalEl(el);
    if (id === 'modal-logout') {
      try { cancelLogoutCountdown(); } catch (err) {}
    }
  }
});

/* ESC closes open modals (in addition to existing handlers) */
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    const wasLogoutOpen = __modals.logout && !__modals.logout.classList.contains('hidden');
    const anyOpen = Object.values(__modals).some(m => m && !m.classList.contains('hidden'));
    if (anyOpen) closeAllModals();
    if (wasLogoutOpen) cancelLogoutCountdown();
  }
});

/* Logout countdown control */
let __logoutInterval = null;

function cancelLogoutCountdown() {
  try {
    if (__logoutInterval) {
      clearInterval(__logoutInterval);
      __logoutInterval = null;
    }
  } catch (e) {}
}

function startLogoutCountdown() {
  try { cancelLogoutCountdown(); } catch (e) {}
  const modal = __modals.logout || document.getElementById('modal-logout');
  if (!modal) return;

  __openModalEl(modal);

  const secEl = document.getElementById('logout-seconds');
  const spinner = modal.querySelector ? modal.querySelector('.spinner-ring') : null;

  const total = 5000;
  const start = performance.now();

  if (secEl) secEl.textContent = '5';
  if (spinner && spinner.style && spinner.style.setProperty) spinner.style.setProperty('--progress', '0%');

  __logoutInterval = setInterval(() => {
    const elapsed = Math.min(total, performance.now() - start);
    const remain = total - elapsed;
    const secs = Math.max(0, Math.ceil(remain / 1000));
    if (secEl) secEl.textContent = String(secs);

    const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
    if (spinner && spinner.style && spinner.style.setProperty) spinner.style.setProperty('--progress', pct.toFixed(1) + '%');

    if (elapsed >= total) {
      cancelLogoutCountdown();
      try { window.location.href = 'https://junkora.xyz/'; } catch (e) {}
    }
  }, 100);
}

/* Bunker selection behavior + Claim */
(function setupBunkerCards(){
  const container = document.querySelector('#modal-bunker .bunker-types');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const card = e.target && e.target.closest ? e.target.closest('.rust-card') : null;
    if (!card) return;

    // Always select clicked card
    container.querySelectorAll('.rust-card').forEach(el => el.classList.remove('selected'));
    card.classList.add('selected');
    const type = card.getAttribute('data-bunker') || 'rust-shack';
    Game.bunkerType = type;
    try { localStorage.setItem('junkora-bunker-type', type); } catch (err) {}

    // Claim button flow
    const claim = e.target && e.target.closest && e.target.closest('.claim-btn');
    if (claim) {
      const modal = document.getElementById('modal-claim');
      if (modal) {
        const name = card.getAttribute('data-name') || (card.querySelector && card.querySelector('.card-title') ? card.querySelector('.card-title').textContent : '') || '';
        const msgEl = modal.querySelector('#claim-msg');
        if (msgEl) msgEl.textContent = 'NFT Claim Available soon. Get your BUNKER on JPG Store.';
        __openModalEl(modal);
      } else {
        try { alert('NFT Claim Available soon Get your BUNKER: https://www.jpg.store/collection/0e949ea8ce1a1aba9efedbd9d402c2f9d1cb46479a381506bfb628de?tab=minting'); } catch (e2) {}
      }
    }
  });

  try {
    const saved = localStorage.getItem('junkora-bunker-type');
    if (saved) {
      const btn = container.querySelector(`.rust-card[data-bunker="${saved}"]`);
      if (btn) btn.classList.add('selected');
      Game.bunkerType = saved;
    }
  } catch (err) {}
})();

// ----------------------------- World Generation ------------------------------

function generateWorld() {
  // Asset manifests for decor variants (per your assets folder)
  // Each item will use a spritesheet at runtime: 8 frames, 64x64 per frame (512x64 total)
  const ASSET_MANIFEST = {
    Trees: {
      dir: 'assets/tree',
      kinds: ['Apple','Birch','Coconut','Jacaranda','Lemon','Mango','Maple','Oak','Orange','Peach','Pine','Sakura','Willow']
    },
    flowers: {
      dir: 'assets/flower',
      kinds: ['Daisy','Lotus','Orchid','Rose','Sunflower','Tulip']
    },
    minerals: {
      dir: 'assets/minerals',
      kinds: ['Adamantite','Amethyst','Basalt','Coal','Copper Ore','Diamond','Emerald','Gold Ore','Granite','Iron Ore','Limestone','Marble','Mooncrystal','Mythril','Obsidian','Opal','rock','Ruby','Sandstone','Sapphire','Silver Ore','Slate','Starstone','Tin Ore','Topaz']
    },
  };

  // Lazy cache for generated spritesheets (built from your single PNGs)
  // SpriteSheets[category][kind] = { canvas, frameCount:8, w:64, h:64, ready:true }
  const SpriteSheets = {
    Trees: Object.create(null),
    flowers: Object.create(null),
    minerals: Object.create(null),
  };

  function filenameFor(cat, kind) {
    // Exact filenames based on your assets list; special-case the lowercase "rock.png"
    if (cat === 'minerals' && kind === 'rock') return 'rock.png';
    return kind + '.png';
  }

  function requestSheet(cat, kind) {
    if (!SpriteSheets[cat]) SpriteSheets[cat] = Object.create(null);
    if (SpriteSheets[cat][kind]) return;

    const manifest = ASSET_MANIFEST[cat];
    if (!manifest) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `${manifest.dir}/${filenameFor(cat, kind)}`;

    img.onload = () => {
      const sheet = buildSpritesheetFromBase(img);
      SpriteSheets[cat][kind] = {
        canvas: sheet,
        frameCount: 8,
        w: 64,
        h: 64,
        ready: true,
      };
    };
    img.onerror = () => {
      // leave undefined -> will fallback to primitive drawing
      console.warn('Failed to load image for spritesheet:', cat, kind, img.src);
    };

    // mark as pending to avoid duplicate loads
    SpriteSheets[cat][kind] = { canvas: null, frameCount: 8, w: 64, h: 64, ready: false };
  }

  function getSheet(cat, kind) {
    if (!SpriteSheets[cat] || !SpriteSheets[cat][kind]) {
      requestSheet(cat, kind);
    }
    const entry = SpriteSheets[cat] && SpriteSheets[cat][kind];
    return entry && entry.ready ? entry : null;
  }

  function buildSpritesheetFromBase(baseImg) {
    const frameW = 64, frameH = 64, frames = 8;

    // If the source is already a 512x64 spritesheet (8x 64x64), keep as-is
    if (baseImg.width === frameW * frames && baseImg.height === frameH) {
      const sheet = document.createElement('canvas');
      sheet.width = baseImg.width;
      sheet.height = baseImg.height;
      const sc = sheet.getContext('2d', { alpha: true });
      sc.imageSmoothingEnabled = false;
      sc.drawImage(baseImg, 0, 0);
      return sheet;
    }

    // Otherwise, duplicate/scale the base across 8 frames
    const canvas = document.createElement('canvas');
    canvas.width = frameW * frames;
    canvas.height = frameH;
    const c = canvas.getContext('2d', { alpha: true });
    c.imageSmoothingEnabled = false;

    for (let f = 0; f < frames; f++) {
      c.drawImage(baseImg, f * frameW, 0, frameW, frameH);
    }
    return canvas;
  }

  function pickRandomKind(category, rng) {
    const manifest = ASSET_MANIFEST[category];
    if (!manifest || !manifest.kinds || manifest.kinds.length === 0) return null;
    const idx = Math.floor((rng || Math.random)() * manifest.kinds.length);
    return manifest.kinds[Math.max(0, Math.min(idx, manifest.kinds.length - 1))];
  }
  // Base world: grass everywhere
  const grid = new Array(WORLD_H);
  for (let y = 0; y < WORLD_H; y++) {
    grid[y] = new Array(WORLD_W);
    for (let x = 0; x < WORLD_W; x++) {
      grid[y][x] = makeTile(x, y, TILE.Grass);
    }
  }

  // Create a pond area
  const pondW = 6, pondH = 4;
  const pondX = 8, pondY = 8;
  for (let y = 0; y < pondH; y++) {
    for (let x = 0; x < pondW; x++) {
      const gx = pondX + x;
      const gy = pondY + y;
      if (inBounds(gx, gy)) {
        const t = grid[gy][gx];
        t.tileId = TILE.Water;
        t.walkable = false;
      }
    }
  }

  // Create a central farm soil rectangle
  const farmW = 24, farmH = 16;
  const farmX = Math.floor(WORLD_W/2 - farmW/2);
  const farmY = Math.floor(WORLD_H/2 - farmH/2);
  for (let y = 0; y < farmH; y++) {
    for (let x = 0; x < farmW; x++) {
      const gx = farmX + x;
      const gy = farmY + y;
      if (inBounds(gx, gy)) {
        grid[gy][gx].tileId = TILE.Soil;
      }
    }
  }

  // Paths removed per request; keep grass instead.

  // Decorations: trees, flowers, rocks on grass, avoid farm and paths/pond
  const decor = [];
  const rand = Game.rng;
  const avoidRect = { x: farmX-1, y: farmY-1, w: farmW+2, h: farmH+2 };

  const decorPerTile = 180 / (64 * 48); // keep same density as original world
  const decorCount = Math.floor(decorPerTile * WORLD_W * WORLD_H);
  for (let i = 0; i < decorCount; i++) {
    const x = Math.floor(rand() * WORLD_W);
    const y = Math.floor(rand() * WORLD_H);
    const t = grid[y][x];
    if (t.tileId !== TILE.Grass) continue;
    if (pointInRect(x, y, avoidRect)) continue;
    if (nearWater(grid, x, y)) continue;

    const r = rand();
    let type = null;
    // Reduce tree spawn rate by half (from 60% -> 30%)
    if (r < 0.3) type = 'Trees';
    else if (r < 0.9) type = 'flowers';
    else type = 'minerals';

    if (type === 'Trees' || type === 'minerals') {
      t.walkable = false;
    }

    const kind = pickRandomKind(type, rand);
    const animOffset = Math.floor(rand() * 1000);
    const hc = initialHarvestCountersForType(type);
    decor.push({ x, y, type, kind, animOffset, maxHarvests: hc.maxHarvests, remainingHarvests: hc.remainingHarvests });
  }

  Game.world = grid;
  Game.decor = decor;
  // Ensure all decor have harvest counters (safety)
  ensureDecorHarvestCounters();

  // Spawn 'Prophecy Seller' NPC at fixed coordinates (128, 59)
  try {
    if (window.Customization && typeof window.Customization.spawnNPC === 'function') {
      window.Customization.spawnNPC(128, 59, 'Prophecy Seller', { role: 'seller' });
    }
  } catch (e) {}

  // Spawn player near path start
  Game.player.x = farmX - 10;
  Game.player.y = 4;
  if (!grid[Game.player.y][Game.player.x].walkable) {
    // find first walkable nearby
    outer: for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = Game.player.x + dx, ny = Game.player.y + dy;
        if (inBounds(nx, ny) && grid[ny][nx].walkable) {
          Game.player.x = nx; Game.player.y = ny;
          break outer;
        }
      }
    }
  }
}

// ----------------------------- Utility ---------------------------------------

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

function nearWater(grid, x, y) {
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const nx = x + i, ny = y + j;
      if (inBounds(nx, ny) && grid[ny][nx].tileId === TILE.Water) return true;
    }
  }
  return false;
}

function tileAt(x, y) {
  if (!inBounds(x, y)) return null;
  return Game.world[y][x];
}

function decorAt(x, y) {
  return Game.decor.find(d => d.x === x && d.y === y) || null;
}

function isBlocked(x, y) {
  if (!inBounds(x, y)) return true;
  const t = tileAt(x, y);
  if (!t.walkable) return true;
  const d = decorAt(x, y);
  if (d && (d.type === 'Trees' || d.type === 'minerals')) return true;
  return false;
}

/**
 * Initialize max/remaining harvest counts based on category.
 * - flowers: 1
 * - Trees: 3-5 (random)
 * - minerals: 1-3 (random)
 */
function initialHarvestCountersForType(category) {
  const cat = String(category);
  const rng = (Game && typeof Game.rng === 'function') ? Game.rng : Math.random;
  if (cat === 'flowers') {
    return { maxHarvests: 1, remainingHarvests: 1 };
  }
  if (cat === 'Trees') {
    const max = Math.floor(rng() * 3) + 3; // 3-5
    return { maxHarvests: max, remainingHarvests: max };
  }
  if (cat === 'minerals') {
    const max = Math.floor(rng() * 3) + 1; // 1-3
    return { maxHarvests: max, remainingHarvests: max };
  }
  return { maxHarvests: 1, remainingHarvests: 1 };
}

/**
 * Ensure all existing decor entries have harvest counters (for loaded saves or new worlds).
 */
function ensureDecorHarvestCounters() {
  if (!Array.isArray(Game.decor)) return;
  for (const d of Game.decor) {
    if (!d) continue;
    if (typeof d.maxHarvests !== 'number' || typeof d.remainingHarvests !== 'number') {
      const init = initialHarvestCountersForType(d.type);
      d.maxHarvests = init.maxHarvests;
      d.remainingHarvests = (typeof d.remainingHarvests === 'number')
        ? Math.max(0, Math.min(d.remainingHarvests, init.maxHarvests))
        : init.remainingHarvests;
    }
  }
}

// ----------------------------- Input -----------------------------------------

const keysDown = new Set();

window.addEventListener('keydown', (e) => {
  keysDown.add(e.code);

  // Prevent arrow keys from scrolling
  if (KEYS.Up.includes(e.code) || KEYS.Down.includes(e.code) ||
      KEYS.Left.includes(e.code) || KEYS.Right.includes(e.code) ) {
    e.preventDefault();
  }

  // Tools
  if (KEYS.ToolHoe.includes(e.code)) setTool(Tools.Hoe);
  if (KEYS.ToolWater.includes(e.code)) setTool(Tools.Water);
  if (KEYS.ToolHand.includes(e.code)) setTool(Tools.Hand);

  // Interact
  if (KEYS.Interact.includes(e.code)) {
    interactFront();
  }

  // Shop
  if (KEYS.Shop.includes(e.code)) {
    toggleShop(true);
  }

  // Grid toggle
  if (KEYS.Grid.includes(e.code)) {
    Game.showGrid = !Game.showGrid;
  }

  // Debug
  if (KEYS.Debug.includes(e.code)) {
    Game.showDebug = !Game.showDebug;
  }

  // Escape closes shop
  if (KEYS.Escape.includes(e.code)) {
    toggleShop(false);
  }
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

toolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (tool === Tools.Hoe || tool === Tools.Water || tool === Tools.Hand) {
      setTool(tool);
    }
  });
});

on(btnShop, 'click', () => toggleShop(true));
on(btnCloseShop, 'click', () => toggleShop(false));
on(modalShop, 'click', (e) => {
  if (e.target === modalShop) toggleShop(false);
});

// Inventory expand/collapse toggle
if (invToggle && invUI) {
  invToggle.addEventListener('click', () => {
    const open = !invUI.classList.contains('open');
    invUI.classList.toggle('open', open);
    if (invPanel) invPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    // ensure panel content is up to date when toggling
    updateInventoryUI();
  });
}

/* ----------------------------- Mobile Joystick (touch/coarse) ----------------------------- */
/* Drag-anywhere low-opacity joystick that maps to cardinal grid directions.
   Enabled automatically on touch/coarse-pointer devices (or small screens).
   Produces MobileInput.dir ∈ Dir | null, which desiredDirFromKeys() prefers.
*/
(function setupMobileJoystick(){
  const isCoarse = () => {
    try { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch(e) { return false; }
  };
  const isTouchCapable = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const isSmall = () => window.innerWidth <= 900;

  const shouldEnable = () => isCoarse() || isTouchCapable() || isSmall();

  const MobileInput = {
    enabled: false,
    dir: null,           // Dir.Up|Down|Left|Right|null
    _active: false,
    _startX: 0,
    _startY: 0,
    _root: null,
    _base: null,
    _knob: null,
    _radius: 56,         // visual radius of base (px)
    _knobR: 28,          // knob radius (px)
    _dead: 10,           // deadzone (px)

    init() {
      if (!shouldEnable()) return;
      this.enabled = true;
      this._buildUI();
      this._bind();
      // Recompute radii after layout
      setTimeout(() => this._computeMetrics(), 0);
      window.MobileInput = this; // expose
    },

    _computeMetrics() {
      try {
        const b = this._base.getBoundingClientRect();
        const k = this._knob.getBoundingClientRect();
        this._radius = Math.floor(Math.min(b.width, b.height) / 2);
        this._knobR = Math.floor(Math.min(k.width, k.height) / 2);
      } catch(e) {}
    },

    _buildUI() {
      // Create container if not present
      const root = document.createElement('div');
      root.id = 'joystick';
      root.style.position = 'fixed';
      root.style.left = '0px';
      root.style.top = '0px';
      root.style.width = '120px';
      root.style.height = '120px';
      root.style.transform = 'translate(-9999px,-9999px)'; // hidden off-screen
      root.style.zIndex = '26';           // above inventory (22) and minimap (24), below gather UI (50)
      root.style.pointerEvents = 'none';  // visuals don't intercept touches
      root.style.opacity = '0.35';        // low opacity as requested

      const base = document.createElement('div');
      base.className = 'joy-base';
      Object.assign(base.style, {
        position: 'absolute',
        inset: '0',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)',
        border: '2px solid rgba(0,229,255,0.35)',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.6), 0 0 12px rgba(0,229,255,0.15)',
        backdropFilter: 'blur(2px)',
      });

      const knob = document.createElement('div');
      knob.className = 'joy-knob';
      const knobSize = 56; // px
      Object.assign(knob.style, {
        position: 'absolute',
        width: knobSize + 'px',
        height: knobSize + 'px',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(0,229,255,0.45)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.5), inset 0 0 8px rgba(255,255,255,0.06)',
        pointerEvents: 'none'
      });

      root.appendChild(base);
      root.appendChild(knob);
      document.body.appendChild(root);
      this._root = root;
      this._base = base;
      this._knob = knob;
    },

    _bind() {
      const onStart = (x, y) => {
        this._active = true;
        this._startX = x;
        this._startY = y;
        this.dir = null;
        this._showAt(x, y);
        this._moveKnob(0, 0);
      };

      const onMove = (x, y) => {
        if (!this._active) return;
        const dx = x - this._startX;
        const dy = y - this._startY;
        const dir = this._toCardinal(dx, dy);
        this.dir = dir;
        // Limit knob within circle
        const lim = Math.max(0, this._radius - this._knobR);
        const mag = Math.hypot(dx, dy);
        const k = mag > 0 ? Math.min(1, lim / mag) : 0;
        this._moveKnob(dx * k, dy * k);
      };

      const onEnd = () => {
        this._active = false;
        this.dir = null;
        this._hide();
      };

      // Touch listeners (drag-anywhere)
      const opts = { passive: false };
      window.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        // Only start joystick when touching the game canvas
        const target = e.target;
        const onGame = target && (target.id === 'game' || (target.closest && target.closest('#game')));
        if (!onGame) return;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        e.preventDefault();
        onStart(t.clientX, t.clientY);
      }, opts);

      window.addEventListener('touchmove', (e) => {
        if (!this.enabled || !this._active) return;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        e.preventDefault();
        onMove(t.clientX, t.clientY);
      }, opts);

      window.addEventListener('touchend', (e) => {
        if (!this.enabled || !this._active) return;
        e.preventDefault();
        onEnd();
      }, opts);
      window.addEventListener('touchcancel', (e) => {
        if (!this.enabled || !this._active) return;
        e.preventDefault();
        onEnd();
      }, opts);

      // On resize/orientation, recompute metrics
      window.addEventListener('resize', () => {
        this._computeMetrics();
        if (!shouldEnable()) {
          this.enabled = false;
          onEnd();
        } else {
          this.enabled = true;
        }
      });
    },

    _toCardinal(dx, dy) {
      const mag = Math.hypot(dx, dy);
      if (mag < this._dead) return null;
      // Decide major axis
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx > 0 ? Dir.Right : Dir.Left;
      } else {
        return dy > 0 ? Dir.Down : Dir.Up; // screen Y grows downwards
      }
    },

    _showAt(x, y) {
      const size = 120;
      // position root so its center is at (x,y)
      this._root.style.width = size + 'px';
      this._root.style.height = size + 'px';
      this._root.style.transform = `translate(${Math.round(x - size/2)}px, ${Math.round(y - size/2)}px)`;
    },

    _hide() {
      this._root.style.transform = 'translate(-9999px,-9999px)';
      // reset knob to center for next time
      this._moveKnob(0, 0);
    },

    _moveKnob(dx, dy) {
      this._knob.style.left = '50%';
      this._knob.style.top = '50%';
      this._knob.style.transform = `translate(${Math.round(-50 + dx * 100 / (this._radius*2))}%, ${Math.round(-50 + dy * 100 / (this._radius*2))}%)`;
    }
  };

  // Delay init until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MobileInput.init());
  } else {
    MobileInput.init();
  }
})();

// ----------------------------- Player Actions --------------------------------

function setTool(tool) {
  Game.tool = tool;
  toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
}

function desiredDirFromKeys() {
  // Prefer mobile joystick on touch/coarse-pointer devices
  if (typeof MobileInput !== 'undefined' && MobileInput.enabled && MobileInput.dir) {
    return MobileInput.dir;
  }

  if (KEYS.Up.some(k => keysDown.has(k))) return Dir.Up;
  if (KEYS.Down.some(k => keysDown.has(k))) return Dir.Down;
  if (KEYS.Left.some(k => keysDown.has(k))) return Dir.Left;
  if (KEYS.Right.some(k => keysDown.has(k))) return Dir.Right;
  return null;
}

function stepPlayer(dt) {
  // Lock movement while gathering
  if (Game.gather && Game.gather.active) return;

  const now = performance.now();
  const desired = desiredDirFromKeys();
  if (!desired) return;

  if (now - Game.player.lastMoveAt < MOVE_COOLDOWN_MS) {
    Game.player.facing = desired; // allow turning without stepping
    return;
  }

  let dx = 0, dy = 0;
  if (desired === Dir.Up) dy = -1;
  if (desired === Dir.Down) dy = 1;
  if (desired === Dir.Left) dx = -1;
  if (desired === Dir.Right) dx = 1;

  const nx = Game.player.x + dx;
  const ny = Game.player.y + dy;

  Game.player.facing = desired;

  if (!isBlocked(nx, ny)) {
    Game.player.x = nx;
    Game.player.y = ny;
    Game.player.lastMoveAt = now;
    save(); // lightweight save on move
    try { syncSupabasePositionThrottled(); } catch (e) {}
    try { trackPresenceThrottled(); } catch (e) {}
  }
}

function frontTileCoords() {
  let dx = 0, dy = 0;
  if (Game.player.facing === Dir.Up) dy = -1;
  if (Game.player.facing === Dir.Down) dy = 1;
  if (Game.player.facing === Dir.Left) dx = -1;
  if (Game.player.facing === Dir.Right) dx = 1;
  return { x: Game.player.x + dx, y: Game.player.y + dy };
}

function interactFront() {
  const { x, y } = frontTileCoords();
  if (!inBounds(x, y)) return;

  const t = tileAt(x, y);
  const d = decorAt(x, y);
  // NPC interaction: Prophecy Seller
  if (d && d.type === 'npc') {
    const sold = sellAllToProphecySeller();
    const npcName = d.name || 'Prophecy Seller';
    if (sold.totalItems > 0) {
      showFloatingText(npcName + ': +' + sold.totalCash + 'c', x, y, '#ffd166');
    } else {
      showFloatingText(npcName + ': Nothing to buy', x, y, '#ef476f');
    }
    updateInventoryUI();
    try { if (typeof updateCurrenciesUI === 'function') updateCurrenciesUI(); } catch (e) {}
    save();
    return;
  }

  // Gather from decor if using Hand tool (Trees, Flowers, Minerals)
  if (Game.tool === Tools.Hand && d && (d.type === 'Trees' || d.type === 'flowers' || d.type === 'minerals')) {
    if (!Game.gather.active) {
      startGathering({ d });
    }
    return;
  }

  // Tool behaviors
  if (Game.tool === Tools.Hoe) {
    // Only on soil base
    if (t.tileId === TILE.Soil && !t.tilled && !t.plant) {
      t.tilled = true;
      showFloatingText('Tilled', x, y, '#d5b895');
      save();
    }
    return;
  }

  if (Game.tool === Tools.Water) {
    if (t.tilled) {
      t.watered = true;
      t.waterEndAt = performance.now() + WATER_DURATION_MS;
      showFloatingText('Watered', x, y, '#79c0ff');
      save();
    }
    return;
  }

  if (Game.tool === Tools.Hand) {
    // Harvest if mature
    if (t.plant && isMature(t.plant)) {
      // Stamina check: require at least 1 to harvest crops
      try {
        const curr = (typeof Mechanics !== 'undefined' && Mechanics.stamina && typeof Mechanics.stamina.current === 'number')
          ? Mechanics.stamina.current
          : (Game.stamina && typeof Game.stamina.current === 'number' ? Game.stamina.current : 0);
        if (curr < 1) {
          showFloatingText('Out of stamina', x, y, '#ef476f');
          return;
        }
      } catch (e) {}
      const type = t.plant.type;
      t.plant = null;
      t.tilled = true; // remains tilled after harvest
      Game.inv.crops[type] = (Game.inv.crops[type] || 0) + 1;
      updateInventoryUI();
      showFloatingText(`+1 ${CROPS[type].display}`, x, y, '#ffd166');
      try { awardSkillExp('harvesting', 1); } catch (e) {}

      // Drain 1 stamina for a successful crop harvest
      try {
        if (typeof Game !== 'undefined' && typeof Game.drainStamina === 'function') {
          Game.drainStamina(1);
        } else if (typeof Mechanics !== 'undefined' && typeof Mechanics.drain === 'function') {
          Mechanics.drain(1);
        }
      } catch (e) {}

      save();
      return;
    }

    // Plant if we have a seed equipped
    if (Game.equippedSeed && t.tilled && !t.plant) {
      const seed = Game.equippedSeed;
      if ((Game.inv.seeds[seed] || 0) > 0) {
        Game.inv.seeds[seed] -= 1;
        t.plant = { type: seed, stage: 0, growthMs: 0 };
        updateInventoryUI();
        showFloatingText(`Planted ${CROPS[seed].display}`, x, y, '#7bd389');
        save();
      } else {
        showFloatingText('No seeds', x, y, '#ef476f');
      }
      return;
    }
  }
}

// ----------------------------- Growth (Real-time) ----------------------------

function isMature(plant) {
  const def = CROPS[plant.type];
  return plant.stage >= def.colors.length - 1;
}

function tickWorld(dtMs, now) {
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const t = tileAt(x, y);
      if (!t) continue;

      // Water evaporation
      if (t.watered && now >= t.waterEndAt) {
        t.watered = false;
        t.waterEndAt = 0;
      }

      // Plant growth (only while watered)
      if (t.plant && t.watered) {
        const plant = t.plant;
        const def = CROPS[plant.type];
        plant.growthMs = (plant.growthMs || 0) + dtMs;

        const needed = def.stageMs[plant.stage] || 0;
        const canAdvance = plant.stage < def.colors.length - 1 && needed > 0;
        if (canAdvance && plant.growthMs >= needed) {
          plant.stage += 1;
          plant.growthMs = 0;
          // Optional: small floating text on growth
          showFloatingText('+Growth', x, y, '#a3e635');
        }
      }
    }
  }
}

// ----------------------------- UI Rendering ----------------------------------

function updateHUD() {
  // Coins HUD moved to apoc-hud via Mechanics.currencies; no direct coin text here.
  if (elEquippedSeed) elEquippedSeed.textContent = Game.equippedSeed ? CROPS[Game.equippedSeed].display : 'None';
  toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === Game.tool));
}

function updateInventoryUI() {
  // Build combined item list (seed stacks then crop stacks)
  const items = [];
  // Seeds first
  Object.keys(CROPS).forEach(type => {
    const count = Game.inv.seeds[type] || 0;
    if (count > 0) {
      items.push({
        kind: 'seed',
        type,
        label: CROPS[type].display + ' Seeds',
        icon: '🌱',
        count
      });
    }
  });
  // Crops next
  const cropIcons = { turnip: '🥕', wheat: '🌾', corn: '🌽' };
  Object.keys(CROPS).forEach(type => {
    const count = Game.inv.crops[type] || 0;
    if (count > 0) {
      items.push({
        kind: 'crop',
        type,
        label: CROPS[type].display,
        icon: cropIcons[type] || '🍃',
        count
      });
    }
  });

  // Gathered items (from ItemSystem gathering)
  {
    const iconFor = (name) => {
      if (name.endsWith(' Wood')) return '🪵';
      if (name === 'Sakura Blossom') return '🌸';
      if (name === 'SEED' || name.toLowerCase().endsWith(' seed')) return '🌱';
      return '🪨'; // default mineral/other
    };
    const hasG = Game.inv && Game.inv.gitems && Object.keys(Game.inv.gitems).length > 0;
    if (hasG) {
      const parseKey = (key) => {
        const parts = String(key).split('__');
        return { name: parts[0] || key, rarity: parts[1] || 'Unknown', quality: parts[2] || 'Unknown' };
      };
      Object.entries(Game.inv.gitems).forEach(([key, count]) => {
        if (count > 0) {
          const { name, rarity, quality } = parseKey(key);
          items.push({
            kind: 'gather',
            type: key,
            baseName: name,
            label: `${name} (${rarity} · ${quality})`,
            icon: iconFor(name),
            count,
            rarity,
            quality
          });
        }
      });
    } else if (Game.inv && Game.inv.items) {
      Object.entries(Game.inv.items).forEach(([name, count]) => {
        if (count > 0) {
          items.push({
            kind: 'gather',
            type: name,
            baseName: name,
            label: name,
            icon: iconFor(name),
            count
          });
        }
      });
    }
  }

  // Render quick bar (6 slots)
  if (typeof document !== 'undefined') {
    const bar = document.getElementById('inventory-bar') || invBar;
    if (bar) {
      bar.innerHTML = '';
      const quick = items.slice(0, 6);

      quick.forEach(item => {
        const slot = document.createElement(item.kind === 'seed' ? 'button' : 'div');
        const textOnly = item.kind === 'gather';
        slot.className = 'inv-slot' + (item.kind === 'seed' && Game.equippedSeed === item.type ? ' selected' : '') + (textOnly ? ' text-only' : '');
        slot.title = item.label;
        slot.setAttribute('aria-label', item.label);

        if (!textOnly) {
          const icon = document.createElement('div');
          icon.className = 'inv-icon';
          icon.textContent = item.icon;
          slot.appendChild(icon);
        }

        const label = document.createElement('div');
        label.className = 'inv-label';
        label.textContent = item.label;

        const countEl = document.createElement('div');
        countEl.className = 'inv-count';
        countEl.textContent = item.count;

        slot.append(label, countEl);
        // Mark gathered item slots for tooltip resolution
        if (item.kind === 'gather') {
          slot.dataset.kind = 'gather';
          if (item.baseName) slot.dataset.baseName = item.baseName;
          if (item.rarity) slot.dataset.rarity = item.rarity;
          if (item.quality) slot.dataset.quality = item.quality;

          // Add SELL button overlay for gathered items
          try {
            const overlay = document.createElement('div');
            overlay.className = 'sell-overlay';

            // Determine price based on rarity and quality
            const meta = Game.inv && Game.inv.itemMeta && Game.inv.itemMeta[item.baseName];
            const last = meta && meta.last;
            const r = item.rarity || (last && last.rarity) || 'Unknown';
            const q = item.quality || (last && last.quality) || 'Unknown';
            const priceEach = computeProphecyPrice(item.baseName || item.label, r, q);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sell-btn';
            btn.textContent = 'SELL ' + priceEach + 'c';
            btn.title = 'Sell 1 for ' + priceEach + 'c';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();

              const proceedSell = () => {
                // Decrement the appropriate stack
                const gkey = item.type;
                if (Game.inv && Game.inv.gitems && typeof Game.inv.gitems[gkey] === 'number') {
                  if (Game.inv.gitems[gkey] <= 0) return;
                  Game.inv.gitems[gkey] -= 1;
                } else if (Game.inv && Game.inv.items && typeof Game.inv.items[item.baseName] === 'number') {
                  if (Game.inv.items[item.baseName] <= 0) return;
                  Game.inv.items[item.baseName] -= 1;
                } else {
                  return;
                }
                // Add cash
                if (!Game.currencies) Game.currencies = { cash: (Game.coins ?? 0), junk: 0, ada: 0 };
                Game.currencies.cash = (Game.currencies.cash || 0) + priceEach;
                Game.coins = Game.currencies.cash;

                try { showFloatingText('+' + priceEach + 'c', Game.player.x, Game.player.y, '#ffd166'); } catch (e) {}
                updateInventoryUI();
                try { if (typeof updateCurrenciesUI === 'function') updateCurrenciesUI(); } catch (e) {}
                updateHUD();
                save();
              };

              if (isHighTier(r, q)) {
                showConfirmModal({
                  title: 'Confirm Sell',
                  text: 'ARE YOU SURE?',
                  details: (item.baseName || item.label) + ' — ' + r + ' · ' + q,
                  confirmLabel: 'Sell'
                }).then(ok => { if (ok) proceedSell(); });
              } else {
                proceedSell();
              }
            });

            overlay.appendChild(btn);
            slot.appendChild(overlay);
          } catch (e) {}
        }

        if (item.kind === 'seed') {
          slot.addEventListener('click', () => {
            Game.equippedSeed = (Game.equippedSeed === item.type) ? null : item.type;
            updateHUD();
            updateInventoryUI();
            save();
          });
        }

        bar.appendChild(slot);
      });

      // Fill remaining slots as empty to make exactly 6
      const empties = Math.max(0, 6 - quick.length);
      for (let i = 0; i < empties; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot empty';
        bar.appendChild(slot);
      }
    }

    // Render expandable panel (30 slots)
    const panel = document.getElementById('inventory-panel') || invPanel;
    if (panel) {
      panel.innerHTML = '';
      // Pager (3 pages of 30)
      const P_SIZE = 30;
      Game.inv.panelPage = Math.max(1, Math.min(3, Game.inv.panelPage || 1));
      const start = (Game.inv.panelPage - 1) * P_SIZE;
      const end = start + P_SIZE;
      const panelItems = items.slice(start, end);

      // Pager controls
      const pager = document.createElement('div');
      pager.className = 'inventory-pager';
      for (let p = 1; p <= 3; p++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pager-btn' + (p === Game.inv.panelPage ? ' active' : '');
        btn.textContent = String(p);
        btn.setAttribute('aria-label', 'Inventory Page ' + p);
        btn.addEventListener('click', () => {
          Game.inv.panelPage = p;
          updateInventoryUI();
          save();
        });
        pager.appendChild(btn);
      }
      panel.appendChild(pager);

      panelItems.forEach(item => {
        const slot = document.createElement(item.kind === 'seed' ? 'button' : 'div');
        const textOnly = item.kind === 'gather';
        slot.className = 'inv-slot' + (item.kind === 'seed' && Game.equippedSeed === item.type ? ' selected' : '') + (textOnly ? ' text-only' : '');
        slot.title = item.label;
        slot.setAttribute('aria-label', item.label);

        if (!textOnly) {
          const icon = document.createElement('div');
          icon.className = 'inv-icon';
          icon.textContent = item.icon;
          slot.appendChild(icon);
        }

        const label = document.createElement('div');
        label.className = 'inv-label';
        label.textContent = item.label;

        const countEl = document.createElement('div');
        countEl.className = 'inv-count';
        countEl.textContent = item.count;

        slot.append(label, countEl);
        // Mark gathered item slots for tooltip resolution
        if (item.kind === 'gather') {
          slot.dataset.kind = 'gather';
          if (item.baseName) slot.dataset.baseName = item.baseName;
          if (item.rarity) slot.dataset.rarity = item.rarity;
          if (item.quality) slot.dataset.quality = item.quality;

          // Add SELL button overlay for gathered items
          try {
            const overlay = document.createElement('div');
            overlay.className = 'sell-overlay';

            // Determine price based on rarity and quality
            const meta = Game.inv && Game.inv.itemMeta && Game.inv.itemMeta[item.baseName];
            const last = meta && meta.last;
            const r = item.rarity || (last && last.rarity) || 'Unknown';
            const q = item.quality || (last && last.quality) || 'Unknown';
            const priceEach = computeProphecyPrice(item.baseName || item.label, r, q);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sell-btn';
            btn.textContent = 'SELL ' + priceEach + 'c';
            btn.title = 'Sell 1 for ' + priceEach + 'c';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();

              const proceedSell = () => {
                // Decrement the appropriate stack
                const gkey = item.type;
                if (Game.inv && Game.inv.gitems && typeof Game.inv.gitems[gkey] === 'number') {
                  if (Game.inv.gitems[gkey] <= 0) return;
                  Game.inv.gitems[gkey] -= 1;
                } else if (Game.inv && Game.inv.items && typeof Game.inv.items[item.baseName] === 'number') {
                  if (Game.inv.items[item.baseName] <= 0) return;
                  Game.inv.items[item.baseName] -= 1;
                } else {
                  return;
                }
                // Add cash
                if (!Game.currencies) Game.currencies = { cash: (Game.coins ?? 0), junk: 0, ada: 0 };
                Game.currencies.cash = (Game.currencies.cash || 0) + priceEach;
                Game.coins = Game.currencies.cash;

                try { showFloatingText('+' + priceEach + 'c', Game.player.x, Game.player.y, '#ffd166'); } catch (e) {}
                updateInventoryUI();
                try { if (typeof updateCurrenciesUI === 'function') updateCurrenciesUI(); } catch (e) {}
                updateHUD();
                save();
              };

              if (isHighTier(r, q)) {
                showConfirmModal({
                  title: 'Confirm Sell',
                  text: 'ARE YOU SURE?',
                  details: (item.baseName || item.label) + ' — ' + r + ' · ' + q,
                  confirmLabel: 'Sell'
                }).then(ok => { if (ok) proceedSell(); });
              } else {
                proceedSell();
              }
            });

            overlay.appendChild(btn);
            slot.appendChild(overlay);
          } catch (e) {}
        }

        if (item.kind === 'seed') {
          slot.addEventListener('click', () => {
            Game.equippedSeed = (Game.equippedSeed === item.type) ? null : item.type;
            updateHUD();
            updateInventoryUI();
            save();
          });
        }

        panel.appendChild(slot);
      });

      const emptyCount = Math.max(0, 30 - panelItems.length);
      for (let i = 0; i < emptyCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot empty';
        panel.appendChild(slot);
      }
    }
  }

  updateHUD();
}

// ----------------------------- Shop ------------------------------------------

function toggleShop(open) {
  if (!modalShop) return;
  if (open) {
    modalShop.classList.remove('hidden');
    modalShop.setAttribute('aria-hidden', 'false');
    updateShopLists();
  } else {
    modalShop.classList.add('hidden');
    modalShop.setAttribute('aria-hidden', 'true');
  }
}

function updateShopLists() {
  if (!shopBuyList || !shopSellList) return;
  // Buy seeds
  shopBuyList.innerHTML = '';
  Object.entries(CROPS).forEach(([type, def]) => {
    const row = document.createElement('div');
    row.className = 'shop-item';

    const name = document.createElement('div');
    name.textContent = `${def.display} Seeds`;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `${def.seedPrice}c`;

    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.title = 'Buy 1 ' + def.display + ' Seeds';
    btn.setAttribute('aria-label', 'Buy 1 ' + def.display + ' Seeds');
    btn.innerHTML = '<span class="ico">➕</span>';
    btn.addEventListener('click', () => {
      const cash = (Game.currencies && typeof Game.currencies.cash === 'number') ? Game.currencies.cash : Game.coins;
      if (cash >= def.seedPrice) {
        if (!Game.currencies) Game.currencies = { cash: cash ?? 0, junk: 0, ada: 0 };
        Game.currencies.cash -= def.seedPrice;
        Game.inv.seeds[type] = (Game.inv.seeds[type] || 0) + 1;
        updateInventoryUI();
        updateCurrenciesUI();
        updateHUD();
        save();
      }
    });

    row.appendChild(name);
    row.appendChild(price);
    row.appendChild(btn);
    shopBuyList.appendChild(row);
  });

  // Sell crops
  shopSellList.innerHTML = '';
  Object.entries(CROPS).forEach(([type, def]) => {
    const count = Game.inv.crops[type] || 0;
    const row = document.createElement('div');
    row.className = 'shop-item';

    const name = document.createElement('div');
    name.textContent = `${def.display} (x${count})`;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `${def.sellPrice}c ea`;

    const btn1 = document.createElement('button');
    btn1.className = 'icon-btn';
    btn1.title = 'Sell 1 ' + def.display;
    btn1.setAttribute('aria-label', 'Sell 1 ' + def.display);
    btn1.innerHTML = '<span class="ico">💰</span>';
    btn1.disabled = count <= 0;
    btn1.addEventListener('click', () => {
      if ((Game.inv.crops[type] || 0) > 0) {
        Game.inv.crops[type] -= 1;
        if (!Game.currencies) Game.currencies = { cash: Game.coins ?? 0, junk: 0, ada: 0 };
        Game.currencies.cash += def.sellPrice;
        updateInventoryUI();
        updateCurrenciesUI();
        updateShopLists();
        updateHUD();
        save();
      }
    });

    const btnAll = document.createElement('button');
    btnAll.className = 'icon-btn';
    btnAll.title = 'Sell All ' + def.display;
    btnAll.setAttribute('aria-label', 'Sell All ' + def.display);
    btnAll.innerHTML = '<span class="ico">📦</span>';
    btnAll.disabled = count <= 0;
    btnAll.addEventListener('click', () => {
      const c = Game.inv.crops[type] || 0;
      if (c > 0) {
        Game.inv.crops[type] = 0;
        if (!Game.currencies) Game.currencies = { cash: Game.coins ?? 0, junk: 0, ada: 0 };
        Game.currencies.cash += def.sellPrice * c;
        updateInventoryUI();
        updateCurrenciesUI();
        updateShopLists();
        updateHUD();
        save();
      }
    });

    row.appendChild(name);
    row.appendChild(price);
    row.appendChild(btn1);
    row.appendChild(btnAll);
    shopSellList.appendChild(row);
  });
}

/* ----------------------------- Prophecy Seller (NPC) ----------------------------- */
// Pricing based on rarity and quality. Falls back gracefully for unknown strings.
function __rarityMult(r) {
  r = String(r || 'Unknown').toLowerCase();
  switch (r) {
    case 'common': return 1.0;
    case 'uncommon': return 1.5;
    case 'rare': return 3.0;
    case 'epic': return 6.0;         // legacy alias (not used by ItemSystem)
    case 'legendary': return 12.0;
    case 'mythic': return 20.0;
    case 'godlike': return 40.0;     // add support for ItemSystem "Godlike"
    default: return 0.75; // Unknown/other
  }
}
function __qualityMult(q) {
  q = String(q || 'Unknown').toLowerCase();
  switch (q) {
    // Back-compat (older naming)
    case 'poor': return 0.6;
    case 'common': return 1.0;
    case 'good': return 1.25;
    case 'excellent': return 1.75;
    case 'pristine': return 2.25;
    // ItemSystem qualities
    case 'dull': return 0.6;
    case 'normal': return 1.0;
    case 'refined': return 1.5;
    // 'pristine' handled above (2.25)
    case 'exquisite': return 3.0;
    default: return 1.0;
  }
}
function __categoryBase(name) {
  try {
    const meta = Game.inv && Game.inv.itemMeta && Game.inv.itemMeta[name] && Game.inv.itemMeta[name].last;
    const cat = String(meta && meta.category || '').toLowerCase();
    if (cat === 'mineral' || cat === 'minerals') return 15;
    if (cat === 'tree' || cat === 'wood' || cat === 'fruit') return 12;
    if (cat === 'flower' || cat === 'flowers') return 8;
  } catch (e) {}
  return 10; // default
}
function computeProphecyPrice(baseName, rarity, quality) {
  const base = __categoryBase(baseName);
  const price = Math.round(base * __rarityMult(rarity) * __qualityMult(quality));
  return Math.max(1, price);
}
// Sell all gathered items (both legacy items and per-identity gitems) to Prophecy Seller
function sellAllToProphecySeller() {
  let totalCash = 0, totalItems = 0;
  const inv = Game.inv || (Game.inv = {});

  // Per-identity stacks (gitems): name__rarity__quality
  if (inv.gitems) {
    for (const [key, count] of Object.entries(inv.gitems)) {
      if (!count || count <= 0) continue;
      const parts = String(key).split('__');
      const baseName = parts[0] || 'Item';
      const rarity = parts[1] || 'Unknown';
      const quality = parts[2] || 'Unknown';
      const priceEach = computeProphecyPrice(baseName, rarity, quality);
      totalCash += priceEach * count;
      totalItems += count;
      inv.gitems[key] = 0;
    }
  }

  // Legacy aggregate stacks (no per-identity info)
  if (inv.items) {
    for (const [baseName, count] of Object.entries(inv.items)) {
      if (!count || count <= 0) continue;
      let rarity = 'Unknown', quality = 'Unknown';
      try {
        const last = inv.itemMeta && inv.itemMeta[baseName] && inv.itemMeta[baseName].last;
        if (last) { rarity = last.rarity || rarity; quality = last.quality || quality; }
      } catch (e) {}
      const priceEach = computeProphecyPrice(baseName, rarity, quality);
      totalCash += priceEach * count;
      totalItems += count;
      inv.items[baseName] = 0;
    }
  }

  // Crops (use configured sellPrice)
  if (inv.crops) {
    for (const [type, count] of Object.entries(inv.crops)) {
      if (!count || count <= 0) continue;
      const def = CROPS[type];
      const priceEach = def ? def.sellPrice : 5;
      totalCash += priceEach * count;
      totalItems += count;
      inv.crops[type] = 0;
    }
  }

  // Seeds (sell at 50% of seed price)
  if (inv.seeds) {
    for (const [type, count] of Object.entries(inv.seeds)) {
      if (!count || count <= 0) continue;
      const def = CROPS[type];
      const priceEach = def ? Math.max(1, Math.round((def.seedPrice || 0) * 0.5)) : 2;
      totalCash += priceEach * count;
      totalItems += count;
      inv.seeds[type] = 0;
    }
  }

  if (!Game.currencies) Game.currencies = { cash: (Game.coins ?? 0), junk: 0, ada: 0 };
  Game.currencies.cash = (Game.currencies.cash || 0) + totalCash;
  Game.coins = Game.currencies.cash;
  return { totalCash, totalItems };
}

/* ----------------------------- Render ---------------------------------------- */
function ensureOtherView(uid, o = { x: 0, y: 0, facing: Dir.Down }) {
  if (!Game.othersView) Game.othersView = {};
  let v = Game.othersView[uid];
  if (!v) {
    v = {
      rx: o.x || 0,
      ry: o.y || 0,
      tx: o.x || 0,
      ty: o.y || 0,
      vx: 0,
      vy: 0,
      facing: o.facing || Dir.Down,
      animFrame: 0,
      animTime: 0,
      animState: 'idle',
      lastUpdate: performance.now()
    };
    Game.othersView[uid] = v;
  }
  return v;
}

/**
 * Smooth remote players with interpolation + simple dead-reckoning prediction.
 * - Interpolates render position (rx,ry) toward last server target (tx,ty)
 * - Adds predicted motion using last estimated velocity (vx,vy)
 * - Updates facing and a small 3-frame walk animation when moving
 */
function updateOtherPlayers(dtMs) {
  if (!Game.othersView) return;
  const dt = Math.max(1, dtMs | 0);
  const dtSec = dt / 1000;
  const spring = 18;         // interpolation strength toward server target
  const maxVel = 10;         // clamp remote velocity (tiles/sec)
  const decay = Math.max(0, 1 - 6 * dtSec); // velocity decay each frame

  for (const [uid, v] of Object.entries(Game.othersView)) {
    if (!v) continue;

    // Clamp crazy velocities
    const spd = Math.hypot(v.vx || 0, v.vy || 0);
    if (spd > maxVel) {
      const k = maxVel / spd;
      v.vx *= k; v.vy *= k;
    }

    const prevRx = v.rx, prevRy = v.ry;

    // Interpolate toward server target and add prediction
    v.rx += (v.tx - v.rx) * spring * dtSec + (v.vx || 0) * dtSec;
    v.ry += (v.ty - v.ry) * spring * dtSec + (v.vy || 0) * dtSec;

    const mdx = v.rx - prevRx;
    const mdy = v.ry - prevRy;
    const moving = Math.abs(mdx) + Math.abs(mdy) > 0.01;

    if (moving) {
      // Face the direction we actually moved this frame
      if (Math.abs(mdx) >= Math.abs(mdy)) {
        v.facing = mdx > 0 ? Dir.Right : Dir.Left;
      } else {
        v.facing = mdy > 0 ? Dir.Down : Dir.Up;
      }
      // Walk anim (3 frames)
      v.animState = 'walking';
      v.animTime = (v.animTime || 0) + dt;
      const interval = 80; // ms/frame
      if (v.animTime >= interval) {
        v.animTime = 0;
        v.animFrame = ((v.animFrame || 0) + 1) % 3;
      }
    } else {
      v.animState = 'idle';
      v.animTime = (v.animTime || 0) + dt;
      const interval = 250;
      if (v.animTime >= interval) {
        v.animTime = 0;
        v.animFrame = ((v.animFrame || 0) + 1) % 3;
      }
    }

    // Decay prediction so it doesn't drift between packets
    v.vx = (v.vx || 0) * decay;
    v.vy = (v.vy || 0) * decay;
  }
}

function draw() {
  // Center camera on player
  Game.camera.x = Game.player.x * TILE_SIZE + TILE_SIZE/2 - canvas.width/2;
  Game.camera.y = Game.player.y * TILE_SIZE + TILE_SIZE/2 - canvas.height/2;

  // Clamp camera to world bounds
  const maxCamX = WORLD_W * TILE_SIZE - canvas.width;
  const maxCamY = WORLD_H * TILE_SIZE - canvas.height;
  Game.camera.x = Math.max(0, Math.min(Game.camera.x, Math.max(0, maxCamX)));
  Game.camera.y = Math.max(0, Math.min(Game.camera.y, Math.max(0, maxCamY)));

  // Clear
  ctx.fillStyle = '#3a5a40';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Compute visible tile bounds
  const startX = Math.max(0, Math.floor(Game.camera.x / TILE_SIZE));
  const startY = Math.max(0, Math.floor(Game.camera.y / TILE_SIZE));
  const endX = Math.min(WORLD_W - 1, Math.ceil((Game.camera.x + canvas.width) / TILE_SIZE));
  const endY = Math.min(WORLD_H - 1, Math.ceil((Game.camera.y + canvas.height) / TILE_SIZE));

  // Base tiles
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const t = tileAt(x, y);
      const px = Math.floor(x * TILE_SIZE - Game.camera.x);
      const py = Math.floor(y * TILE_SIZE - Game.camera.y);
      // Base
      const isGrass = t.tileId === TILE.Grass;
      if (isGrass && grassTilesetReady) {
        // Use pre-assigned random variant for truly random tiling per world load
        const variantIdx = t.grassVariant || 0;
        const variantX = variantIdx % GRASS_COLS;
        const variantY = Math.floor(variantIdx / GRASS_COLS);
        const sx = variantX * GRASS_TILE_SIZE;
        const sy = variantY * GRASS_TILE_SIZE;
        ctx.drawImage(grassTilesetImg, sx, sy, GRASS_TILE_SIZE, GRASS_TILE_SIZE, px, py, TILE_SIZE, TILE_SIZE);
      } else {
        const tileDef = TILESET[t.tileId];
        if (tileDef) {
          // Use customization system if available
          const customTile = typeof window.Customization !== 'undefined' ? 
            window.Customization.getCustomTile(t.tileId) : null;
          
          if (customTile) {
            // Custom tile rendering
            const noiseVar = customTile.noiseVariation || 0.08;
            const v = pseudoNoise(x, y) * noiseVar - (noiseVar / 2);
            ctx.fillStyle = shadeColor(customTile.baseColor, v);
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // Grunge speckles
            if (customTile.grungeSpeckles !== false) {
              ctx.fillStyle = 'rgba(0,0,0,0.15)';
              const s1 = Math.floor(pseudoNoise(x * 3 + 1, y * 3 + 2) * TILE_SIZE);
              const s2 = Math.floor(pseudoNoise(x * 5 + 7, y * 5 + 11) * TILE_SIZE);
              ctx.fillRect(px + (s1 % TILE_SIZE), py + (s2 % TILE_SIZE), 2, 2);
              ctx.fillRect(px + ((s2 + 7) % TILE_SIZE), py + ((s1 + 13) % TILE_SIZE), 1, 1);
            }

            // Oil stain rings on paths/soil
            if (customTile.oilStains) {
              ctx.strokeStyle = 'rgba(30,30,30,0.15)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px + (s2 % TILE_SIZE), py + (s1 % TILE_SIZE), 5, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Toxic ripples on water
            if (customTile.toxicRipples) {
              ctx.strokeStyle = 'rgba(0, 255, 180, 0.12)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 6, 0, Math.PI * 2);
              ctx.stroke();
            }
          } else {
            // Original tile rendering (fallback)
            const v = pseudoNoise(x, y) * 0.08 - 0.04;
            ctx.fillStyle = shadeColor(tileDef.base, v);
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // Grunge speckles (garbage-world feel)
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            const s1 = Math.floor(pseudoNoise(x * 3 + 1, y * 3 + 2) * TILE_SIZE);
            const s2 = Math.floor(pseudoNoise(x * 5 + 7, y * 5 + 11) * TILE_SIZE);
            ctx.fillRect(px + (s1 % TILE_SIZE), py + (s2 % TILE_SIZE), 2, 2);
            ctx.fillRect(px + ((s2 + 7) % TILE_SIZE), py + ((s1 + 13) % TILE_SIZE), 1, 1);

            // Oil stain rings on paths/soil
            if (t.tileId === TILE.Path || t.tileId === TILE.Soil) {
              ctx.strokeStyle = 'rgba(30,30,30,0.15)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px + (s2 % TILE_SIZE), py + (s1 % TILE_SIZE), 5, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Toxic ripples on water
            if (t.tileId === TILE.Water) {
              ctx.strokeStyle = 'rgba(0, 255, 180, 0.12)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 6, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      // Tilled overlay
      if (t.tilled) {
        ctx.fillStyle = '#6a4726';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // hatch
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < TILE_SIZE; i += 6) {
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i - 6, py + TILE_SIZE);
        }
        ctx.stroke();
      }

      // Watered overlay
      if (t.watered) {
        ctx.fillStyle = 'rgba(80,160,220,0.28)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }

      // Plant
      if (t.plant) {
        drawPlant(t.plant, px, py);
      }

      // Grid overlay
      if (Game.showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }

      // Debug coords (hidden by default)
      if (Game.showDebug) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '10px monospace';
        ctx.fillText(`${x},${y}`, px + 2, py + 12);
      }
    }
  }

  // Depth-sorted decorations and player (Y-sort so "bottom" appears on top)
  const renderables = [];
  for (const d of Game.decor) {
    if (d.x < startX - 1 || d.x > endX + 1 || d.y < startY - 1 || d.y > endY + 1) continue;
    const baseY = d.y * TILE_SIZE + TILE_SIZE; // anchor at tile baseline
    renderables.push({ type: 'decor', d, baseY });
  }
  // Include player in sort for correct occlusion with decor
  renderables.push({ type: 'player', baseY: Game.player.y * TILE_SIZE + TILE_SIZE });

  // Other players (predicted + smoothed)
  if (Game.othersView) {
    for (const [uid, v] of Object.entries(Game.othersView)) {
      if (!v) continue;
      const ox = Math.round(v.rx);
      const oy = Math.round(v.ry);
      if (ox < startX - 1 || ox > endX + 1 || oy < startY - 1 || oy > endY + 1) continue;
      const username = (Game.others && Game.others[uid] && Game.others[uid].username) || 'Player';
      const o = { x: ox, y: oy, username, facing: v.facing, animFrame: v.animFrame };
      renderables.push({ type: 'other', o, baseY: oy * TILE_SIZE + TILE_SIZE });
    }
  }

  // Sort by baseline Y (then stable order)
  renderables.sort((a, b) => a.baseY - b.baseY);

  for (const r of renderables) {
    if (r.type === 'decor') {
      const d = r.d;
      const px = Math.floor(d.x * TILE_SIZE - Game.camera.x);
      const py = Math.floor(d.y * TILE_SIZE - Game.camera.y);
      drawDecor(d, px, py);
    } else if (r.type === 'player') {
      drawPlayer();
    } else if (r.type === 'other') {
      drawOtherPlayer(r.o);
    }
  }

  // Floating texts
  drawFloaties();
}

function drawPlant(plant, px, py) {
  const def = CROPS[plant.type];
  const col = def.colors[Math.min(plant.stage, def.colors.length - 1)];
  // Simple stage-based shapes
  if (plant.stage === 0) {
    // seed
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2, py + TILE_SIZE/2 + 6, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (plant.stage === 1) {
    // sprout
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + TILE_SIZE/2, py + TILE_SIZE/2 + 8);
    ctx.lineTo(px + TILE_SIZE/2, py + TILE_SIZE/2 - 2);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2 - 4, py + TILE_SIZE/2 - 2, 3, 0, Math.PI * 2);
    ctx.arc(px + TILE_SIZE/2 + 4, py + TILE_SIZE/2 - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // mature
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2, py + TILE_SIZE/2, 8, 0, Math.PI * 2);
    ctx.fill();

    // small accents per crop type
    if (plant.type === 'wheat') {
      ctx.strokeStyle = '#e6d07a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + TILE_SIZE/2, py + TILE_SIZE/2 + 6);
      ctx.lineTo(px + TILE_SIZE/2, py + TILE_SIZE/2 - 6);
      ctx.stroke();
    }
    if (plant.type === 'corn') {
      ctx.fillStyle = '#f7e36a';
      ctx.fillRect(px + TILE_SIZE/2 - 2, py + TILE_SIZE/2 - 6, 4, 12);
    }
  }
}

function drawDecor(d, px, py) {
  // Prefer spritesheet rendering (per-item variants)
  const category = d.type; // 'Trees' | 'flowers' | 'minerals'
  const kind = d.kind || null;
  const offset = d.animOffset || 0;

  // Attempt to get the spritesheet (lazy-built from base PNGs)
      try {
        // getSheet is available within generateWorld scope via closure; expose on window for draw
        if (!window.__SpriteSheetAPI) {
          console.warn('Spritesheet API unavailable; falling back to primitive drawing.');
        } else if (category && kind) {
          const entry = window.__SpriteSheetAPI.get(category, kind);
          if (entry) {
            const dx = Math.abs(d.x - Game.player.x);
            const dy = Math.abs(d.y - Game.player.y);
            const isClose = (dx + dy) <= DECOR_PROXIMITY;
            const now = performance.now();
            const frameMs = 120;
            const frame = isClose ? Math.floor(((now + offset) / frameMs) % entry.frameCount) : 0;
            const sx = frame * entry.w;
            const sy = 0;

            // Anchor bottom-center to the tile (TILE_SIZE is 32)
            const scale = (category === 'Trees') ? 1.5 : 1;
            const drawW = entry.w * scale;
            const drawH = entry.h * scale;
            const posDx = px - (drawW - TILE_SIZE) / 2;
            const posDy = py - (drawH - TILE_SIZE);

            ctx.drawImage(entry.canvas, sx, sy, entry.w, entry.h, posDx, posDy, drawW, drawH);
            return;
          } else {
            // Begin loading if not already; next frames will draw when ready
            window.__SpriteSheetAPI.request(category, kind);
          }
        }
      } catch (e) {
        console.warn('Spritesheet draw failed, falling back to default:', e);
      }

  // If a customization system is present, map new categories to legacy keys for compatibility.
  if (typeof window.Customization !== 'undefined') {
    const legacyType = category === 'Trees' ? 'tree' : category === 'minerals' ? 'rock' : category === 'flowers' ? 'flower' : category;
    const customDecor = window.Customization.getCustomDecoration(legacyType);
    if (customDecor && typeof customDecor.draw === 'function') {
      try {
        customDecor.draw(ctx, px, py, TILE_SIZE);
        return;
      } catch (e) {
        console.warn('Custom decoration draw failed, falling back to primitive:', e);
      }
    }
  }

  // Primitive fallback shapes (if spritesheets are not yet ready)
  if (category === 'Trees') {
    const scale = 1.5;
    const trunkW = 4 * scale;
    const trunkH = 10 * scale;
    const foliageR = 10 * scale;
    const branchLen = 6 * scale;
    const branchStartY = -12 * scale;
    const branchEndY = -4 * scale;

    ctx.fillStyle = '#3a2e24';
    ctx.fillRect(px + TILE_SIZE / 2 - trunkW / 2, py + TILE_SIZE - trunkH, trunkW, trunkH);
    ctx.fillStyle = '#4b3d33';
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2 + branchStartY + foliageR, foliageR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(px + TILE_SIZE / 2, py + TILE_SIZE / 2 + branchStartY);
    ctx.lineTo(px + TILE_SIZE / 2 + branchLen, py + TILE_SIZE / 2 + branchEndY);
    ctx.stroke();
  } else if (category === 'flowers') {
    ctx.fillStyle = '#31343a';
    ctx.beginPath();
    ctx.ellipse(px + TILE_SIZE / 2, py + TILE_SIZE - 8, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#202227';
    ctx.fillRect(px + TILE_SIZE / 2 - 2, py + TILE_SIZE - 14, 4, 6);
    ctx.fillStyle = '#00e0ff';
    ctx.fillRect(px + TILE_SIZE / 2 + 4, py + TILE_SIZE - 12, 2, 2);
  } else if (category === 'minerals') {
    ctx.fillStyle = '#6f7278';
    ctx.beginPath();
    ctx.moveTo(px + 8, py + TILE_SIZE - 6);
    ctx.lineTo(px + TILE_SIZE - 6, py + TILE_SIZE - 10);
    ctx.lineTo(px + TILE_SIZE - 10, py + TILE_SIZE - 4);
    ctx.closePath();
    ctx.fill();
  }
}

function getRowForDir(dir) {
  switch (dir) {
    case Dir.Up: return 0;
    case Dir.Left: return 1;
    case Dir.Down: return 2;
    case Dir.Right: return 3;
    default: return 2; // down
  }
}

function updatePlayerAnim(dt) {
  const now = performance.now();
  const isInput = !!desiredDirFromKeys();
  const inCooldown = now - Game.player.lastMoveAt < MOVE_COOLDOWN_MS;
  const isWalking = isInput && inCooldown;

  if (isWalking) {
    Game.player.animState = 'walking';
    const interval = 40; // ~3 frames over 120ms
    Game.player.animTime += dt;
    if (Game.player.animTime >= interval) {
      Game.player.animTime = 0;
      Game.player.animFrame = (Game.player.animFrame + 1) % 3; // 3 frames per direction
    }
  } else {
    Game.player.animState = 'idle';
    const interval = 250; // slow idle
    Game.player.animTime += dt;
    if (Game.player.animTime >= interval) {
      Game.player.animTime = 0;
      Game.player.animFrame = (Game.player.animFrame + 1) % 3; // 3 frames (from walk sheet)
    }
  }
}

function drawPlayer() {
  const px = Math.floor(Game.player.x * TILE_SIZE - Game.camera.x);
  const py = Math.floor(Game.player.y * TILE_SIZE - Game.camera.y);

  if ((!walkReady && Game.player.animState === 'walking') || (!idleReady && Game.player.animState === 'idle')) {
    // Fallback to old rendering if not loaded
    ctx.fillStyle = '#fdd2a0';
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2, py + TILE_SIZE/2, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2b2f36';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let fx = 0, fy = 0;
    if (Game.player.facing === Dir.Up) fy = -6;
    if (Game.player.facing === Dir.Down) fy = 6;
    if (Game.player.facing === Dir.Left) fx = -6;
    if (Game.player.facing === Dir.Right) fx = 6;
    ctx.moveTo(px + TILE_SIZE/2, py + TILE_SIZE/2);
    ctx.lineTo(px + TILE_SIZE/2 + fx, py + TILE_SIZE/2 + fy);
    ctx.stroke();
    // Username above head (fallback)
    try {
      const name = (Game && Game.username) || localStorage.getItem('junkora-username') || 'Wanderer';
      if (name) {
        const nameX = Math.floor(px + TILE_SIZE / 2);
        const nameY = Math.floor(py + TILE_SIZE/2 - 14);
        ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.miterLimit = 2;
        ctx.lineJoin = 'round';
        ctx.strokeText(name, nameX, nameY);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(name, nameX, nameY);
      }
    } catch (e) {}
    return;
  }

  const isWalking = Game.player.animState === 'walking';
  const img = walkImg;
  const framesPerRow = 3;
  const rowHeight = 64;
  const frameWidth = 64;
  const row = isWalking ? getRowForDir(Game.player.facing) : 2; // down row for idle
  const sy = row * rowHeight;
  const sx = Game.player.animFrame * frameWidth;

  // Draw scaled to tile (32x32), centered bottom-anchored (sprite bottom at tile bottom)
  const spriteScale = 0.75; // 64->48 (1.5x original)
  const drawW = 64 * spriteScale;
  const drawH = 64 * spriteScale;
  const drawX = px + TILE_SIZE / 2 - drawW / 2;
  const drawY = py + TILE_SIZE - drawH; // bottom align

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, frameWidth, rowHeight, drawX, drawY, drawW, drawH);

  // Username above head
  try {
    const name = (Game && Game.username) || localStorage.getItem('junkora-username') || 'Wanderer';
    if (name) {
      const nameX = Math.floor(px + TILE_SIZE / 2);
      const nameY = Math.floor(drawY - 4);
      ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.miterLimit = 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(name, nameX, nameY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, nameX, nameY);
    }
  } catch (e) {}
}

// Add slight color variance per tile
function drawOtherPlayer(o) {
  const px = Math.floor(o.x * TILE_SIZE - Game.camera.x);
  const py = Math.floor(o.y * TILE_SIZE - Game.camera.y);

  if (!walkReady) {
    // Fallback avatar if sprites not ready
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2, py + TILE_SIZE/2, 8, 0, Math.PI * 2);
    ctx.fill();

    // Username above head for fallback
    try {
      const name = o.username || 'Player';
      const nameX = Math.floor(px + TILE_SIZE / 2);
      const nameY = Math.floor(py - 4);
      ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.miterLimit = 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(name, nameX, nameY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, nameX, nameY);
    } catch (e) {}
    return;
  }

  // Render remote players using the same walk spritesheet as the local player
  const img = walkImg;
  const frameWidth = 64;
  const rowHeight = 64;
  const row = getRowForDir(o.facing || Dir.Down);
  const sy = row * rowHeight;
  // Use middle frame by default; respect o.animFrame if provided
  const frame = (typeof o.animFrame === 'number') ? (o.animFrame % 3) : 1;
  const sx = frame * frameWidth;

  const spriteScale = 0.75; // match local player scale
  const drawW = 64 * spriteScale;
  const drawH = 64 * spriteScale;
  const drawX = px + TILE_SIZE / 2 - drawW / 2;
  const drawY = py + TILE_SIZE - drawH; // bottom align to tile

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, frameWidth, rowHeight, drawX, drawY, drawW, drawH);

  // Username above head
  try {
    const name = o.username || 'Player';
    const nameX = Math.floor(px + TILE_SIZE / 2);
    const nameY = Math.floor(drawY - 4);
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.miterLimit = 2;
    ctx.lineJoin = 'round';
    ctx.strokeText(name, nameX, nameY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, nameX, nameY);
  } catch (e) {}
}

function pseudoNoise(x, y) {
  const n = Math.sin((x * 12.9898 + y * 78.233) * 43758.5453);
  return n - Math.floor(n);
}

function shadeColor(hex, amt) {
  // hex #rrggbb
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + r * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + g * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + b * amt)));
  return `rgb(${r},${g},${b})`;
}

// ----------------------------- Floating Text ---------------------------------

const floaties = [];
function showFloatingText(text, gx, gy, color = '#fff') {
  const x = gx * TILE_SIZE + TILE_SIZE/2;
  const y = gy * TILE_SIZE + TILE_SIZE/2;
  floaties.push({ text, x, y, color, t: 0, life: 1000 });
}

function drawFloaties() {
  const now = performance.now();
  for (let i = floaties.length - 1; i >= 0; i--) {
    const f = floaties[i];
    f.t = f.t || now;
    const dt = now - f.t;
    const k = Math.min(1, dt / f.life);
    const sx = Math.floor(f.x - Game.camera.x);
    const sy = Math.floor(f.y - Game.camera.y - k * 24);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = f.color;
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, sx, sy);
    ctx.globalAlpha = 1;
    if (dt >= f.life) {
      floaties.splice(i, 1);
    }
  }
}

/* ---------- Item Tooltip (Inventory/Gathered) ---------- */
(function setupItemTooltip(){
  if (typeof document === 'undefined') return;
  const tip = document.createElement('div');
  tip.id = 'item-tooltip';
  document.body.appendChild(tip);
  tip.style.display = 'none';

  window.__ItemTooltip = {
    show(html, x, y) {
      try {
        tip.innerHTML = html;
        tip.style.display = 'block';
        this.move(x, y);
      } catch (e) {}
    },
    move(x, y) {
      try {
        const pad = 12;
        const w = tip.offsetWidth || 180;
        const h = tip.offsetHeight || 60;
        let left = x + 16;
        let top = y + 16;
        if (left + w + pad > window.innerWidth) left = Math.max(pad, x - w - 16);
        if (top + h + pad > window.innerHeight) top = Math.max(pad, y - h - 16);
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
      } catch (e) {}
    },
    hide() { tip.style.display = 'none'; }
  };

  // Delegate hover events to all inventory slots; only show for gathered items
  document.addEventListener('mouseover', (e) => {
    const slot = e.target && e.target.closest && e.target.closest('.inv-slot');
    if (!slot) return;
    const isGather = slot.dataset && slot.dataset.kind === 'gather';
    if (!isGather) return;

    const labelEl = slot.querySelector && slot.querySelector('.inv-label');
    const labelText = labelEl && labelEl.textContent;
    const baseName = (slot.dataset && slot.dataset.baseName) || labelText;
    if (!baseName) return;

    // Prefer exact rarity/quality on the slot (per-identity), fallback to last meta
    const slotRarity = slot.dataset && slot.dataset.rarity;
    const slotQuality = slot.dataset && slot.dataset.quality;

    let rarity = slotRarity || 'Unknown';
    let quality = slotQuality || 'Unknown';
    let category = '';
    let source = '';

    const meta = Game.inv && Game.inv.itemMeta && Game.inv.itemMeta[baseName];
    if (meta && meta.last) {
      // Only use category/source from meta; do not override rarity/quality if slot has them
      category = meta.last.category || '';
      source = meta.last.source || '';
      if (!slotRarity) rarity = meta.last.rarity || rarity;
      if (!slotQuality) quality = meta.last.quality || quality;
    }

    const srcLine = (category || source) ? `<div class="tt-sub">${category}${source ? ' · ' + source : ''}</div>` : '';
    const html = `
      <div class="tt-name">${baseName}</div>
      ${srcLine}
      <div class="tt-row">Rarity: <span class="rarity rarity-${rarity}">${rarity}</span></div>
      <div class="tt-row">Quality: <span class="quality">${quality}</span></div>
    `;
    if (window.__ItemTooltip) window.__ItemTooltip.show(html, e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', (e) => {
    if (window.__ItemTooltip) window.__ItemTooltip.move(e.clientX, e.clientY);
  });

  document.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    const stillInSlot = to && to.closest && to.closest('.inv-slot');
    if (!stillInSlot && window.__ItemTooltip) window.__ItemTooltip.hide();
  });
})();

function buildGatherTooltipContent(name) {
  try {
    const meta = Game.inv && Game.inv.itemMeta && Game.inv.itemMeta[name];
    const last = meta && meta.last || null;
    const rarity = last ? last.rarity : 'Unknown';
    const quality = last ? last.quality : 'Unknown';
    const category = last && last.category ? last.category : '';
    const source = last && last.source ? last.source : '';
    const srcLine = (category || source) ? `<div class="tt-sub">${category}${source ? ' · ' + source : ''}</div>` : '';
    return `
      <div class="tt-name">${name}</div>
      ${srcLine}
      <div class="tt-row">Rarity: <span class="rarity rarity-${rarity}">${rarity}</span></div>
      <div class="tt-row">Quality: <span class="quality">${quality}</span></div>
    `;
  } catch (e) {
    return `<div class="tt-name">${name}</div>`;
  }
}

/* ----------------------------- Skills System --------------------------------- */

function defaultSkills() {
  return {
    mining: { level: 1, exp: 0 },       // minerals
    flower: { level: 1, exp: 0 },       // flowers
    harvesting: { level: 1, exp: 0 },   // trees (fruit/wood) and crop harvests
  };
}

function ensureSkills() {
  try {
    if (!Game.skills) Game.skills = defaultSkills();
    const def = defaultSkills();
    for (const k of Object.keys(def)) {
      if (!Game.skills[k]) Game.skills[k] = { ...def[k] };
      if (typeof Game.skills[k].level !== 'number') Game.skills[k].level = 1;
      if (typeof Game.skills[k].exp !== 'number') Game.skills[k].exp = 0;
    }
  } catch (e) {}
}

// Simple linear EXP curve per level: 10, 20, 30, ...
function expNeededFor(level) {
  level = Math.max(1, Math.floor(level || 1));
  return 10 + (level - 1) * 10;
}

function updateSkillsModal() {
  try {
    ensureSkills();
    const bind = (key, levelElId, barFillId, barTextId) => {
      const s = Game.skills[key];
      const need = expNeededFor(s.level);
      const cur = Math.max(0, Math.min(s.exp, need));
      const pct = Math.max(0, Math.min(100, (cur / need) * 100));

      const lvlEl = document.getElementById(levelElId);
      const fillEl = document.getElementById(barFillId);
      const txtEl = document.getElementById(barTextId);

      if (lvlEl) lvlEl.textContent = 'Lv ' + s.level;
      if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
      if (txtEl) txtEl.textContent = cur + ' / ' + need;
    };

    bind('mining', 'skill-mining-level', 'skill-mining-exp', 'skill-mining-exp-text');
    bind('flower', 'skill-flower-level', 'skill-flower-exp', 'skill-flower-exp-text');
    bind('harvesting', 'skill-harvesting-level', 'skill-harvesting-exp', 'skill-harvesting-exp-text');
  } catch (e) {}
}

function awardSkillExp(key, amount = 1) {
  try {
    ensureSkills();
    if (!Game.skills[key]) return;
    const s = Game.skills[key];
    s.exp += Math.max(0, amount);
    let leveled = false;
    while (s.exp >= expNeededFor(s.level)) {
      s.exp -= expNeededFor(s.level);
      s.level += 1;
      leveled = true;
    }
    updateSkillsModal();
    try { save(); } catch (e) {}
    if (leveled) {
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      try { showFloatingText(cap + ' Lv ' + s.level + '!', Game.player.x, Game.player.y, '#7a5fa3'); } catch (e) {}
    }
  } catch (e) {}
}

/* ----------------------------- Gathering UI/Logic ----------------------------- */

const gatherUI = document.createElement('div');
gatherUI.id = 'gather-ui';
const gatherIcon = document.createElement('img');
gatherIcon.id = 'gather-icon';
gatherIcon.src = 'assets/icons/gather.png';
gatherIcon.alt = 'Gather';
const gatherProgress = document.createElement('div');
gatherProgress.id = 'gather-progress';
const gatherProgressFill = document.createElement('div');
gatherProgressFill.id = 'gather-progress-fill';
gatherProgress.appendChild(gatherProgressFill);
gatherUI.appendChild(gatherIcon);
gatherUI.appendChild(gatherProgress);
document.body.appendChild(gatherUI);
gatherUI.style.display = 'none';

/* ----------------------------- Minimap --------------------------------- */

const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d', { alpha: true }) : null;
const minimapCoordsEl = document.getElementById('minimap-coords');
const MINIMAP_SIZE = minimapCanvas ? minimapCanvas.width : 168;
const MINIMAP_MARGIN = 6;
let __minimapBase = null;
let __minimapDrawSize = Math.max(0, MINIMAP_SIZE - MINIMAP_MARGIN * 2);

function __hexToRgb(hex) {
  try {
    if (!hex) return { r: 0, g: 0, b: 0 };
    if (hex.startsWith('rgb')) {
      const m = hex.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    }
    const s = hex.startsWith('#') ? hex.slice(1) : hex;
    const c = parseInt(s, 16);
    return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
  } catch (e) { return { r: 0, g: 0, b: 0 }; }
}

function buildMinimapBase() {
  if (!minimapCtx || !Game.world) return;
  __minimapDrawSize = Math.max(8, MINIMAP_SIZE - MINIMAP_MARGIN * 2);
  const off = document.createElement('canvas');
  off.width = __minimapDrawSize;
  off.height = __minimapDrawSize;
  const oc = off.getContext('2d', { alpha: true });
  const img = oc.createImageData(off.width, off.height);
  const data = img.data;

  const grass = __hexToRgb(TILESET[TILE.Grass].base);
  const soil = __hexToRgb(TILESET[TILE.Soil].base);
  const water = __hexToRgb(TILESET[TILE.Water].base);
  const path = __hexToRgb(TILESET[TILE.Path].base);

  for (let y = 0; y < off.height; y++) {
    const ty = Math.floor(y * WORLD_H / off.height);
    for (let x = 0; x < off.width; x++) {
      const tx = Math.floor(x * WORLD_W / off.width);
      const t = tileAt(tx, ty);
      let col = grass;
      if (t) {
        if (t.tileId === TILE.Grass) col = grass;
        else if (t.tileId === TILE.Soil) col = soil;
        else if (t.tileId === TILE.Water) col = water;
        else if (t.tileId === TILE.Path) col = path;
      }
      const idx = (y * off.width + x) * 4;
      data[idx + 0] = col.r;
      data[idx + 1] = col.g;
      data[idx + 2] = col.b;
      data[idx + 3] = 255;
    }
  }
  oc.putImageData(img, 0, 0);
  __minimapBase = off;
}

function drawMinimap() {
  if (!minimapCtx) return;
  const size = MINIMAP_SIZE;
  minimapCtx.clearRect(0, 0, size, size);

  // Base world snapshot
  if (__minimapBase) {
    minimapCtx.drawImage(__minimapBase, MINIMAP_MARGIN, MINIMAP_MARGIN);
  }

  // Camera viewport rectangle
  try {
    const worldPxW = WORLD_W * TILE_SIZE;
    const worldPxH = WORLD_H * TILE_SIZE;
    const kx = __minimapDrawSize / worldPxW;
    const ky = __minimapDrawSize / worldPxH;
    const rx = MINIMAP_MARGIN + Game.camera.x * kx;
    const ry = MINIMAP_MARGIN + Game.camera.y * ky;
    const rw = Math.max(2, canvas.width * kx);
    const rh = Math.max(2, canvas.height * ky);
    minimapCtx.strokeStyle = 'rgba(0,229,255,0.85)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(Math.floor(rx) + 0.5, Math.floor(ry) + 0.5, Math.floor(rw), Math.floor(rh));
  } catch (e) {}

  // Player dot
  try {
    const px = MINIMAP_MARGIN + ((Game.player.x + 0.5) / WORLD_W) * __minimapDrawSize;
    const py = MINIMAP_MARGIN + ((Game.player.y + 0.5) / WORLD_H) * __minimapDrawSize;
    minimapCtx.fillStyle = '#00e5ff';
    minimapCtx.beginPath();
    minimapCtx.arc(px, py, 2.5, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.strokeStyle = 'rgba(0,0,0,0.4)';
    minimapCtx.lineWidth = 1;
    minimapCtx.stroke();

    // Other players dots
    if (Game.others) {
      for (const [uid, o] of Object.entries(Game.others)) {
        const ox = MINIMAP_MARGIN + ((o.x + 0.5) / WORLD_W) * __minimapDrawSize;
        const oy = MINIMAP_MARGIN + ((o.y + 0.5) / WORLD_H) * __minimapDrawSize;
        minimapCtx.fillStyle = '#a855f7';
        minimapCtx.beginPath();
        minimapCtx.arc(ox, oy, 2.0, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.strokeStyle = 'rgba(0,0,0,0.4)';
        minimapCtx.lineWidth = 1;
        minimapCtx.stroke();
      }
    }
  } catch (e) {}

  // Coordinates label
  if (minimapCoordsEl) {
    minimapCoordsEl.textContent = `${Game.player.x}, ${Game.player.y}`;
  }
}

// Large map renderer (in modal)
function drawLargeMap() {
  try {
    const modal = __modals && __modals.minimap;
    if (!modal || modal.classList.contains('hidden')) return;

    const canvasLarge = document.getElementById('minimap-large-canvas');
    if (!canvasLarge || !__minimapBase) return;

    const lc = canvasLarge.getContext('2d', { alpha: true });
    if (!lc) return;

    const W = canvasLarge.width;
    const H = canvasLarge.height;
    lc.imageSmoothingEnabled = false;
    lc.clearRect(0, 0, W, H);

    // Fit the base into the large canvas preserving aspect ratio
    const bw = __minimapBase.width;
    const bh = __minimapBase.height;
    const scale = Math.min(W / bw, H / bh);
    const drawW = Math.floor(bw * scale);
    const drawH = Math.floor(bh * scale);
    const offX = Math.floor((W - drawW) / 2);
    const offY = Math.floor((H - drawH) / 2);

    lc.save();
    lc.globalAlpha = 0.6;
    lc.drawImage(__minimapBase, offX, offY, drawW, drawH);
    lc.restore();

    // Overlays (viewport rect and player dot)
    const worldPxW = WORLD_W * TILE_SIZE;
    const worldPxH = WORLD_H * TILE_SIZE;
    const kx = drawW / worldPxW;
    const ky = drawH / worldPxH;


    // Player dot
    const px = offX + ((Game.player.x + 0.5) / WORLD_W) * drawW;
    const py = offY + ((Game.player.y + 0.5) / WORLD_H) * drawH;
    lc.fillStyle = '#00e5ff';
    lc.beginPath();
    lc.arc(px, py, 4, 0, Math.PI * 2);
    lc.fill();
    lc.strokeStyle = 'rgba(0,0,0,0.5)';
    lc.lineWidth = 1;
    lc.stroke();
  } catch (e) {}
}

let currentGatherCandidate = null;

gatherIcon.addEventListener('click', () => {
  if (!Game.gather.active && currentGatherCandidate) {
    startGathering({ d: currentGatherCandidate });
  }
});

function isDecorGatherable(d) {
  if (!d) return false;
  const hasHarvests = (typeof d.remainingHarvests !== 'number') || d.remainingHarvests > 0;
  return hasHarvests && (d.type === 'Trees' || d.type === 'flowers' || d.type === 'minerals');
}

function findGatherCandidate() {
  // Prioritize front tile
  const f = frontTileCoords();
  let d = decorAt(f.x, f.y);
  if (isDecorGatherable(d)) return d;
  // Flower on current tile (player may stand on flowers)
  d = decorAt(Game.player.x, Game.player.y);
  if (isDecorGatherable(d)) return d;
  // Neighbors within manhattan distance 1
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      const nd = decorAt(Game.player.x + dx, Game.player.y + dy);
      if (isDecorGatherable(nd)) return nd;
    }
  }
  return null;
}

function positionGatherUIAtTile(tx, ty, offsetY = 0) {
  const screenX = Math.floor(tx * TILE_SIZE - Game.camera.x + TILE_SIZE / 2);
  const screenY = Math.floor(ty * TILE_SIZE - Game.camera.y);
  const uiX = screenX - 36; // center ~72px wide UI
  const uiY = screenY - 28 + offsetY;
  gatherUI.style.transform = `translate(${uiX}px, ${uiY}px)`;
}

function startGathering({ d }) {
  if (!d) return;
  if (typeof d.remainingHarvests === 'number' && d.remainingHarvests <= 0) {
    const gx = d.x, gy = d.y;
    showFloatingText('Depleted', gx, gy, '#ef476f');
    return;
  }
  // Stamina check: require at least 1 to start gathering decor
  try {
    const curr = (typeof Mechanics !== 'undefined' && Mechanics.stamina && typeof Mechanics.stamina.current === 'number')
      ? Mechanics.stamina.current
      : (Game.stamina && typeof Game.stamina.current === 'number' ? Game.stamina.current : 0);
    if (curr < 1) {
      const gx = d.x, gy = d.y;
      showFloatingText('Out of stamina', gx, gy, '#ef476f');
      return;
    }
  } catch (e) {}
  Game.gather.active = true;
  Game.gather.target = { d };
  Game.gather.startAt = performance.now();
  Game.gather.duration = GATHER_TIME_MS;
  Game.gather.progress = 0;

  // Show UI immediately
  gatherUI.style.display = 'block';
  gatherProgress.style.display = 'block';
  gatherIcon.style.display = 'none';

  // Ensure tool reflects gather action (visual only)
  try { setTool(Tools.Hand); } catch (e) {}
}

function finishGathering() {
  const d = Game.gather.target?.d;
  if (!d) return;
  const category = (d.type === 'Trees') ? 'tree' : (d.type === 'flowers') ? 'flower' : 'mineral';
  const nodeName = category === 'tree' ? `${d.kind} Tree` : (d.kind || 'Unknown');
  const gx = d.x, gy = d.y;

  try {
    if (typeof window.ItemSystem !== 'undefined' && window.ItemSystem && typeof window.ItemSystem.gather === 'function') {
      const gathered = window.ItemSystem.gather(category, nodeName);
      if (!Game.inv.items) Game.inv.items = {};
      Game.inv.items[gathered.name] = (Game.inv.items[gathered.name] || 0) + 1;

      // New per-identity stack: separate by rarity and quality
      if (!Game.inv.gitems) Game.inv.gitems = {};
      const gkey = `${gathered.name}__${gathered.rarity}__${gathered.quality}`;
      Game.inv.gitems[gkey] = (Game.inv.gitems[gkey] || 0) + 1;

      // Track metadata for tooltips (last rarity/quality and simple counts)
      if (!Game.inv.itemMeta) Game.inv.itemMeta = {};
      const mm = Game.inv.itemMeta[gathered.name] || { total: 0, countsByRarity: {}, countsByQuality: {}, last: null };
      mm.total += 1;
      mm.countsByRarity[gathered.rarity] = (mm.countsByRarity[gathered.rarity] || 0) + 1;
      mm.countsByQuality[gathered.quality] = (mm.countsByQuality[gathered.quality] || 0) + 1;
      mm.last = { rarity: gathered.rarity, quality: gathered.quality, category, source: nodeName };
      Game.inv.itemMeta[gathered.name] = mm;

      // 2% chance to also drop a resource-specific Seed (Trees/Flowers only)
      try {
        if (category === 'tree' || category === 'flower') {
          if (Math.random() < 0.02) {
            if (!Game.inv.gitems) Game.inv.gitems = {};
            const base = (d && d.kind ? String(d.kind).trim() : '');
            if (base) {
              const seedName = `${base} Seed`;
              const seedKey = `${seedName}__Unknown__Unknown`;
              Game.inv.gitems[seedKey] = (Game.inv.gitems[seedKey] || 0) + 1;
              showFloatingText(`+1 ${seedName}`, gx, gy, '#a3e635');
            }
          }
        }
      } catch (e) {}

      updateInventoryUI();

      const text = `+1 ${gathered.name} (${gathered.rarity}, ${gathered.quality})`;
      showFloatingText(text, gx, gy, '#22c55e');
      try {
        if (category === 'mineral') {
          awardSkillExp('mining', 1);
        } else if (category === 'flower') {
          awardSkillExp('flower', 1);
        } else if (category === 'tree') {
          awardSkillExp('harvesting', 1);
        }
      } catch (e) {}

      // Drain 1 stamina for a successful decor gather
      try {
        if (typeof Game !== 'undefined' && typeof Game.drainStamina === 'function') {
          Game.drainStamina(1);
        } else if (typeof Mechanics !== 'undefined' && typeof Mechanics.drain === 'function') {
          Mechanics.drain(1);
        }
      } catch (e) {}

      // Decrement remaining harvests and despawn if depleted
      try {
        if (typeof d.remainingHarvests === 'number') {
          d.remainingHarvests = Math.max(0, d.remainingHarvests - 1);
          if (d.remainingHarvests === 0) {
            // free tile and remove from decor
            const t = tileAt(gx, gy);
            if (t) t.walkable = true;
            const idx = Game.decor.indexOf(d);
            if (idx >= 0) Game.decor.splice(idx, 1);
            showFloatingText('Resource depleted', gx, gy, '#ef476f');
          }
        }
      } catch (e) {}

      save();
    } else {
      showFloatingText('Cannot gather (ItemSystem missing)', gx, gy, '#ef476f');
    }
  } catch (e) {
    console.warn('Gather failed:', e);
    showFloatingText('Gather failed', gx, gy, '#ef476f');
  }
}

function updateGathering(now) {
  if (!Game.gather.active) return;

  const d = Game.gather.target?.d;
  if (d) positionGatherUIAtTile(d.x, d.y);

  const elapsed = now - Game.gather.startAt;
  const k = Math.max(0, Math.min(1, elapsed / Game.gather.duration));
  Game.gather.progress = k;
  gatherProgressFill.style.width = (k * 100).toFixed(1) + '%';

  // hide icon while in progress
  gatherIcon.style.display = 'none';

  if (k >= 1) {
    finishGathering();
    Game.gather.active = false;
    Game.gather.target = null;
    gatherProgressFill.style.width = '0%';
  }
}

function updateGatherUI() {
  if (Game.gather.active) {
    gatherUI.style.display = 'block';
    gatherProgress.style.display = 'block';
    return;
  }

  const cand = findGatherCandidate();
  currentGatherCandidate = cand;
  if (cand) {
    positionGatherUIAtTile(cand.x, cand.y, -4);
    gatherUI.style.display = 'block';
    gatherProgress.style.display = 'none';
    gatherIcon.style.display = 'block';
  } else {
    gatherUI.style.display = 'none';
  }
}

// ----------------------------- Save / Load -----------------------------------

function ensureGatherIdentityMigration() {
  try {
    const inv = Game.inv || (Game.inv = {});
    if (!inv) return;
    if (!inv.gitems) inv.gitems = {};

    // If gitems already populated, nothing to do
    const hasAnyG = inv.gitems && Object.keys(inv.gitems).length > 0;
    if (hasAnyG) return;

    // Build per-identity stacks from legacy aggregates if present
    if (inv.items && Object.keys(inv.items).length > 0) {
      const meta = inv.itemMeta || {};
      Object.entries(inv.items).forEach(([name, count]) => {
        if (!count || count <= 0) return;
        const m = meta[name];

        if (m && m.countsByRarity && Object.keys(m.countsByRarity).length > 0) {
          // Split legacy counts by rarity; quality unknown
          let sumR = 0;
          Object.entries(m.countsByRarity).forEach(([rarity, rc]) => {
            if (!rc || rc <= 0) return;
            const key = `${name}__${rarity}__Unknown`;
            inv.gitems[key] = (inv.gitems[key] || 0) + rc;
            sumR += rc;
          });
          // If totals don't add up, put remainder into Unknown/Unknown
          if (sumR < count) {
            const key = `${name}__Unknown__Unknown`;
            inv.gitems[key] = (inv.gitems[key] || 0) + (count - sumR);
          }
        } else {
          // No rarity breakdown available
          const key = `${name}__Unknown__Unknown`;
          inv.gitems[key] = (inv.gitems[key] || 0) + count;
        }
      });
    }
  } catch (e) {
    // ignore
  }
}

function save() {
  try {
    const data = {
      coins: (Game.currencies && typeof Game.currencies.cash === 'number') ? Game.currencies.cash : Game.coins,
      currencies: Game.currencies ?? { cash: (Game.coins ?? 50), junk: 0, ada: 0 },
      stamina: Game.stamina ?? (typeof Mechanics !== 'undefined' ? Mechanics.stamina : { max: 100, current: 100, lastRegenAt: Date.now() }),
      tool: Game.tool,
      equippedSeed: Game.equippedSeed,
      inv: Game.inv,
      player: Game.player,
      world: serializeWorld(),
      decor: Game.decor,
      skills: Game.skills,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore quota errors
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Game.coins = data.coins ?? Game.coins;
    Game.tool = data.tool ?? Game.tool;
    Game.equippedSeed = data.equippedSeed ?? Game.equippedSeed;
    Game.stamina = data.stamina ?? Game.stamina ?? { max: 100, current: 100, lastRegenAt: Date.now() };
    if (Game.stamina && typeof Game.stamina.lastRegenAt !== 'number') { Game.stamina.lastRegenAt = Date.now(); }
    Game.inv = data.inv ?? Game.inv;
    Game.player.x = data.player?.x ?? Game.player.x;
    Game.player.y = data.player?.y ?? Game.player.y;
    Game.player.facing = data.player?.facing ?? Game.player.facing;
    Game.world = deserializeWorld(data.world);
    Game.decor = data.decor ?? Game.decor;
    Game.skills = data.skills ?? Game.skills;
    try { ensureSkills(); } catch (e) {}
    // Ensure decor from saves have harvest counters
    ensureDecorHarvestCounters();

    // Ensure per-identity gathered stacks are materialized for UI (from legacy saves)
    ensureGatherIdentityMigration();

    // Migrate currencies: prefer structured currencies; fallback to legacy coins
    Game.currencies = data.currencies ?? Game.currencies ?? { cash: (data.coins ?? Game.coins ?? 50), junk: 0, ada: 0 };
    // Keep legacy numeric coins in sync for compatibility
    Game.coins = Game.currencies.cash;
    // Mirror into Mechanics if available (Mechanics.js is loaded before this file)
    try { if (typeof Mechanics !== 'undefined') Mechanics.currencies = Game.currencies; } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

function serializeWorld() {
  const now = performance.now();
  const rows = [];
  for (let y = 0; y < WORLD_H; y++) {
    const row = [];
    for (let x = 0; x < WORLD_W; x++) {
      const t = tileAt(x, y);
      row.push({
        i: t.tileId,
        ti: t.tilled ? 1 : 0,
        wa: t.watered ? 1 : 0,
        wr: t.watered ? Math.max(0, Math.floor(t.waterEndAt - now)) : 0, // remaining water ms
        pl: t.plant ? { ty: t.plant.type, st: t.plant.stage, gm: Math.floor(t.plant.growthMs || 0) } : null,
        w: t.walkable ? 1 : 0,
      });
    }
    rows.push(row);
  }
  return rows;
}

function deserializeWorld(rows) {
  if (!rows) return Game.world;
  const now = performance.now();
  const grid = new Array(WORLD_H);
  for (let y = 0; y < WORLD_H; y++) {
    grid[y] = new Array(WORLD_W);
    for (let x = 0; x < WORLD_W; x++) {
      const r = rows[y][x];
      const t = makeTile(x, y, r.i);
      t.tilled = !!r.ti;
      t.watered = !!r.wa;
      t.waterEndAt = t.watered ? now + (r.wr || 0) : 0;
      t.plant = r.pl ? { type: r.pl.ty, stage: r.pl.st, growthMs: r.pl.gm || 0 } : null;
      t.walkable = !!r.w;
      grid[y][x] = t;
    }
  }
  return grid;
}

function removePathsFromWorld() {
  if (!Game.world) return;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const t = Game.world[y][x];
      if (t && t.tileId === TILE.Path) {
        t.tileId = TILE.Grass;
        t.walkable = true;
      }
    }
  }
}

function pruneTreesByHalfOnce() {
  // Prune approximately half of existing Trees from saves, only once.
  try {
    if (localStorage.getItem('junkora-pruned-trees-v1') === '1') return;
  } catch (e) {}
  if (!Array.isArray(Game.decor) || Game.decor.length === 0) {
    try { localStorage.setItem('junkora-pruned-trees-v1', '1'); } catch (e) {}
    return;
  }
  let changed = false;
  const pruned = [];
  for (const d of Game.decor) {
    if (d && d.type === 'Trees') {
      if (Game.rng() < 0.5) {
        // remove tree; free tile
        const t = tileAt(d.x, d.y);
        if (t) t.walkable = true;
        changed = true;
        continue;
      }
    }
    pruned.push(d);
  }
  if (changed) {
    Game.decor = pruned;
    try { localStorage.setItem('junkora-pruned-trees-v1', '1'); } catch (e) {}
    // persist immediately
    save();
  } else {
    try { localStorage.setItem('junkora-pruned-trees-v1', '1'); } catch (e) {}
  }
}

function removeDefaultSeedsOnce() {
  try {
    if (localStorage.getItem('junkora-removed-default-seeds-v1') === '1') return;
  } catch (e) {}
  try {
    if (Game && Game.inv && Game.inv.seeds) {
      Game.inv.seeds.turnip = 0;
      Game.inv.seeds.wheat = 0;
      Game.inv.seeds.corn = 0;
      save();
    }
  } catch (e) {}
  try { localStorage.setItem('junkora-removed-default-seeds-v1', '1'); } catch (e) {}
}

// Migrate any saved decor types to new categories and add 'kind' where missing
function migrateDecorTypes() {
  if (!Array.isArray(Game.decor)) return;

  // Recreate the helper API from generateWorld scope on first call
  if (!window.__SpriteSheetAPI) {
    // Rebuild minimal manifest and helpers matching those in generateWorld
    const manifest = {
      Trees: ['Apple','Birch','Coconut','Jacaranda','Lemon','Mango','Maple','Oak','Orange','Peach','Pine','Sakura','Willow'],
      flowers: ['Daisy','Lotus','Orchid','Rose','Sunflower','Tulip'],
      minerals: ['Adamantite','Amethyst','Basalt','Coal','Copper Ore','Diamond','Emerald','Gold Ore','Granite','Iron Ore','Limestone','Marble','Mooncrystal','Mythril','Obsidian','Opal','rock','Ruby','Sandstone','Sapphire','Silver Ore','Slate','Starstone','Tin Ore','Topaz'],
    };

    // shared lazy cache across sessions
    const cache = { Trees: Object.create(null), flowers: Object.create(null), minerals: Object.create(null) };

    function dirFor(cat) {
      if (cat === 'Trees') return 'assets/tree';
      if (cat === 'flowers') return 'assets/flower';
      if (cat === 'minerals') return 'assets/minerals';
      return '';
    }
    function filenameFor(cat, kind) {
      if (cat === 'minerals' && kind === 'rock') return 'rock.png';
      return kind + '.png';
    }
    function buildSpritesheetFromBase(baseImg) {
      const frameW = 64, frameH = 64, frames = 8;

      // If the source is already a 512x64 spritesheet (8x 64x64), keep as-is
      if (baseImg.width === frameW * frames && baseImg.height === frameH) {
        const sheet = document.createElement('canvas');
        sheet.width = baseImg.width;
        sheet.height = baseImg.height;
        const sc = sheet.getContext('2d', { alpha: true });
        sc.imageSmoothingEnabled = false;
        sc.drawImage(baseImg, 0, 0);
        return sheet;
      }

      // Otherwise, duplicate/scale the base across 8 frames
      const canvas = document.createElement('canvas');
      canvas.width = frameW * frames;
      canvas.height = frameH;
      const c = canvas.getContext('2d', { alpha: true });
      c.imageSmoothingEnabled = false;
      for (let f = 0; f < frames; f++) {
        c.drawImage(baseImg, f * frameW, 0, frameW, frameH);
      }
      return canvas;
    }
    function request(cat, kind) {
      if (!cache[cat]) cache[cat] = Object.create(null);
      if (cache[cat][kind]) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `${dirFor(cat)}/${filenameFor(cat, kind)}`;
      img.onload = () => {
        cache[cat][kind] = {
          canvas: buildSpritesheetFromBase(img),
          frameCount: 8,
          w: 64,
          h: 64,
          ready: true,
        };
      };
      img.onerror = () => {
        console.warn('Failed to load image for spritesheet:', cat, kind, img.src);
      };
      cache[cat][kind] = { canvas: null, frameCount: 8, w: 64, h: 64, ready: false };
    }
    function get(cat, kind) {
      if (!cache[cat] || !cache[cat][kind]) request(cat, kind);
      const entry = cache[cat] && cache[cat][kind];
      return entry && entry.ready ? entry : null;
    }
    window.__SpriteSheetAPI = { request, get };
  }

  for (const d of Game.decor) {
    if (!d || !d.type) continue;
    // Map old -> new
    if (d.type === 'tree') d.type = 'Trees';
    else if (d.type === 'rock') d.type = 'minerals';
    else if (d.type === 'flower') d.type = 'flowers';

    // Assign kind if missing
    if (!d.kind) {
      const kinds = (d.type === 'Trees')
        ? ['Apple','Birch','Coconut','Jacaranda','Lemon','Mango','Maple','Oak','Orange','Peach','Pine','Sakura','Willow']
        : (d.type === 'flowers')
          ? ['Daisy','Lotus','Orchid','Rose','Sunflower','Tulip']
          : (d.type === 'minerals')
            ? ['Adamantite','Amethyst','Basalt','Coal','Copper Ore','Diamond','Emerald','Gold Ore','Granite','Iron Ore','Limestone','Marble','Mooncrystal','Mythril','Obsidian','Opal','rock','Ruby','Sandstone','Sapphire','Silver Ore','Slate','Starstone','Tin Ore','Topaz']
            : [];
      if (kinds.length) {
        const idx = Math.floor(Game.rng() * kinds.length);
        d.kind = kinds[idx];
      }
    }

    // Animation offset if missing
    if (typeof d.animOffset !== 'number') {
      d.animOffset = Math.floor(Game.rng() * 1000);
    }
  }
}

/* ----------------------------- Username Handling ----------------------------- */
function generateRandomUsername() {
  try {
    let token = '';
    if (window.crypto && window.crypto.getRandomValues) {
      const a = new Uint32Array(2);
      window.crypto.getRandomValues(a);
      token = (a[0].toString(36) + a[1].toString(36)).slice(0, 8);
    } else {
      token = Math.random().toString(36).slice(2, 10);
    }
    return 'JNK-' + token.toUpperCase();
  } catch (e) {
    return 'JNK-' + Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}

function sanitizeUsername(name) {
  try {
    let s = String(name || '').trim();
    s = s.replace(/[^A-Za-z0-9 _\-]/g, ''); // allow letters, numbers, space, underscore, hyphen
    if (s.length < 3) return null;
    return s.slice(0, 24);
  } catch (e) {
    return null;
  }
}

function ensureUsername() {
  try {
    let u = localStorage.getItem('junkora-username');
    const clean = sanitizeUsername(u);
    if (!u || !clean) {
      u = generateRandomUsername();
      localStorage.setItem('junkora-username', u);
    }
    Game.username = u;
  } catch (e) {
    Game.username = Game.username || generateRandomUsername();
  }
}

function setupUsernameEditing() {
  try {
    const el = document.getElementById('profile-username');
    if (!el) return;
    el.title = 'Click to edit username';
    el.style.cursor = 'pointer';
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');

    const edit = () => {
      try { openUsernameModal(); } catch (e) {}
    };

    el.addEventListener('click', edit);
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        edit();
      }
    });

    // Initialize text immediately if available
    if (Game && Game.username) {
      el.textContent = Game.username;
    }
  } catch (e) {}
}
function openUsernameModal() {
  try {
    const modal = __modals && __modals.username ? __modals.username : document.getElementById('modal-username');
    const input = document.getElementById('username-input');
    const err = document.getElementById('username-error');
    if (!modal || !input) return;
    if (err) err.style.display = 'none';
    const cur = (Game && Game.username) || localStorage.getItem('junkora-username') || '';
    input.value = cur;
    __openModalEl(modal);
    try { input.focus(); input.select(); } catch (e) {}
  } catch (e) {}
}

function setupUsernameModal() {
  try {
    const saveBtn = document.getElementById('username-save');
    const input = document.getElementById('username-input');
    const err = document.getElementById('username-error');
    if (!input) return;

    const doSave = () => {
      const clean = sanitizeUsername(input.value);
      if (!clean) {
        if (err) {
          err.textContent = 'Invalid username. Use 3–24 characters: letters, numbers, spaces, _ or -';
          err.style.display = 'block';
        }
        return;
      }
      Game.username = clean;
      try { localStorage.setItem('junkora-username', clean); } catch (e) {}
      try { updateProfileModal(); } catch (e) {}
      const modal = __modals && __modals.username ? __modals.username : document.getElementById('modal-username');
      if (modal) __closeModalEl(modal);
    };

    if (saveBtn) saveBtn.addEventListener('click', doSave);
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        doSave();
      }
    });
    input.addEventListener('input', () => {
      if (err) err.style.display = 'none';
    });
  } catch (e) {}
}
// Supabase initial sync and throttled position updates
async function syncSupabaseInitial() {
  try {
    if (window.DB) {
      await DB.ensureSession?.();
      await DB.ensureProfile({
        username: Game.username,
        wallet_address: (window.JunkoraWallet && window.JunkoraWallet.address) || null
      });
      // Persist starting coords and balances
      await DB.saveCoordinates({ x: Game.player.x, y: Game.player.y, z: 0, zone: "overworld" });
      const cash = (Game.currencies && typeof Game.currencies.cash === "number") ? Game.currencies.cash : (Game.coins ?? 50);
      const junk = (Game.currencies && typeof Game.currencies.junk === "number") ? Game.currencies.junk : 0;
      await DB.updateBalances({ cash, junk });
      Game._lastSyncedPos = { x: Game.player.x, y: Game.player.y };
      Game._lastCoordSyncAt = performance.now();
    }
  } catch (e) {}
}

function syncSupabasePositionThrottled() {
  try {
    if (!window.DB) return;
    const now = performance.now();
    const { x, y } = Game.player;
    const last = Game._lastSyncedPos || { x: null, y: null };
    // Throttle to 1 call per 2s or on position change
    if (x === last.x && y === last.y && (now - Game._lastCoordSyncAt) < 2000) return;
    Game._lastSyncedPos = { x, y };
    Game._lastCoordSyncAt = now;
    DB.saveCoordinates({ x, y, z: 0, zone: "overworld" }).catch(() => {});
  } catch (e) {}
}

/* ----------------------------- Realtime Presence (MMO-lite) ----------------------------- */
let __Presence = { channel: null, uid: null, lastTrackAt: 0, lastPos: { x: null, y: null } };

async function initPresence() {
  try {
    if (!window.DB || !DB.supabase) return;
    const user = await DB.ensureSession?.();
    __Presence.uid = user && user.id;
    const uname = (Game && Game.username) || localStorage.getItem('junkora-username') || 'Wanderer';

    const ch = DB.supabase.channel('presence:overworld', {
      config: { presence: { key: __Presence.uid || 'anon' } }
    });

    ch.on('presence', { event: 'sync' }, () => {
      try {
        const state = ch.presenceState() || {};
        const others = {};
        const now = performance.now();
        for (const [uid, metas] of Object.entries(state)) {
          if (uid === (__Presence.uid || 'anon')) continue;
          const meta = metas && metas[metas.length - 1];
          if (!meta) continue;
          const { x, y, username, ts } = meta;
          const ox = Math.floor(x || 0);
          const oy = Math.floor(y || 0);
          others[uid] = {
            x: ox,
            y: oy,
            username: username || 'Player',
            lastSeen: ts || Date.now()
          };

          // Update smoothing/prediction state
          try {
            const v = (function ensureOtherView(uid, o) {
              if (!Game.othersView) Game.othersView = {};
              let vv = Game.othersView[uid];
              if (!vv) {
                vv = {
                  rx: o.x || 0,
                  ry: o.y || 0,
                  tx: o.x || 0,
                  ty: o.y || 0,
                  vx: 0,
                  vy: 0,
                  facing: o.facing || Dir.Down,
                  animFrame: 0,
                  animTime: 0,
                  animState: 'idle',
                  lastUpdate: performance.now()
                };
                Game.othersView[uid] = vv;
              }
              return vv;
            })(uid, others[uid]);

            const dtSec = Math.max(0.001, (now - v.lastUpdate) / 1000);
            const dx = ox - v.tx;
            const dy = oy - v.ty;

            // Set new target from server
            v.tx = ox;
            v.ty = oy;

            // Estimate velocity (tiles/sec), ignore large teleports
            if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) {
              v.vx = dx / dtSec;
              v.vy = dy / dtSec;
            } else {
              v.vx = 0;
              v.vy = 0;
              // Snap closer to target on teleport
              v.rx = ox;
              v.ry = oy;
            }

            // Update facing based on server delta
            if (Math.abs(dx) >= Math.abs(dy)) {
              v.facing = dx > 0 ? Dir.Right : (dx < 0 ? Dir.Left : v.facing);
            } else {
              v.facing = dy > 0 ? Dir.Down : (dy < 0 ? Dir.Up : v.facing);
            }

            v.lastUpdate = now;
          } catch (e2) {}
        }

        // Assign new others set
        Game.others = others;

        // GC stale views not present anymore
        if (Game.othersView) {
          for (const id in Game.othersView) {
            if (!others[id]) delete Game.othersView[id];
          }
        }
      } catch (e) {}
    });

    ch.on('presence', { event: 'leave' }, ({ key }) => {
      try {
        if (key) {
          if (Game.others && Game.others[key]) delete Game.others[key];
          if (Game.othersView && Game.othersView[key]) delete Game.othersView[key];
        }
      } catch (e) {}
    });

    // Real-time movement broadcast handler for immediate smoothing
    ch.on('broadcast', { event: 'movement' }, ({ payload }) => {
      try {
        if (!payload || !payload.uid) return;
        const { uid, x, y, facing, username, ts } = payload;
        if (uid === (__Presence.uid || 'anon')) return;
        const ox = Math.floor(x || 0);
        const oy = Math.floor(y || 0);

        // Update or create in 'others' map
        if (!Game.others) Game.others = {};
        Game.others[uid] = {
          x: ox,
          y: oy,
          username: username || (Game.others[uid] && Game.others[uid].username) || 'Player',
          lastSeen: ts || Date.now()
        };

        // Update smoothing/prediction view state
        const v = ensureOtherView(uid, { x: ox, y: oy, facing: facing || Dir.Down });
        const now = performance.now();
        const dtSec = Math.max(0.001, (now - (v.lastUpdate || now)) / 1000);
        const dx = ox - v.tx;
        const dy = oy - v.ty;

        v.tx = ox;
        v.ty = oy;

        if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) {
          v.vx = dx / dtSec;
          v.vy = dy / dtSec;
        } else {
          v.vx = 0;
          v.vy = 0;
          v.rx = ox;
          v.ry = oy;
        }

        if (typeof facing === 'string') v.facing = facing;
        v.lastUpdate = now;
      } catch (e) {}
    });

    await ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        try {
          ch.track({ x: Game.player.x, y: Game.player.y, facing: Game.player.facing || Dir.Down, username: uname, ts: Date.now() });
          __Presence.lastTrackAt = performance.now();
          __Presence.lastPos = { x: Game.player.x, y: Game.player.y };
        } catch (e) {}
      }
    });

    __Presence.channel = ch;
    window.addEventListener('beforeunload', () => { try { ch.unsubscribe(); } catch (e) {} });
  } catch (e) {}
}

function trackPresenceThrottled() {
  try {
    const ch = __Presence && __Presence.channel;
    if (!ch) return;
    const now = performance.now();
    const { x, y } = Game.player;
    const moved = (__Presence.lastPos.x !== x || __Presence.lastPos.y !== y);
    if (!moved && (now - __Presence.lastTrackAt) < 150) return;
    const uname = (Game && Game.username) || localStorage.getItem('junkora-username') || 'Wanderer';
    const facing = Game.player.facing || Dir.Down;

    // Update presence meta (stateful) with facing for initial/roster sync
    ch.track({ x, y, facing, username: uname, ts: Date.now() });

    // Broadcast a movement event so other clients can update immediately between presence syncs
    try {
      ch.send({
        type: 'broadcast',
        event: 'movement',
        payload: {
          uid: __Presence.uid || 'anon',
          x, y, facing,
          username: uname,
          ts: Date.now()
        }
      });
    } catch (e) {}

    __Presence.lastTrackAt = now;
    __Presence.lastPos = { x, y };
  } catch (e) {}
}

/* --------------------------------------------------------------------------- */
// ----------------------------- Game Loop -------------------------------------

let lastTime = 0;
function loop(ts) {
  const dt = (ts - lastTime) || 16;
  lastTime = ts;

  tickWorld(dt, ts);
  stepPlayer(dt);
  updatePlayerAnim(dt);
  updateOtherPlayers(dt);
  draw();
  drawMinimap();
  // If map modal is open, refresh large map view too
  if (__modals && __modals.minimap && !__modals.minimap.classList.contains('hidden')) {
    drawLargeMap();
  }
  // Gathering progress + UI
  updateGathering(ts);
  updateGatherUI();

  Game._autosaveMs += dt;
  if (Game._autosaveMs >= AUTOSAVE_INTERVAL_MS) {
    save();
    Game._autosaveMs = 0;
  }

  requestAnimationFrame(loop);
}

// ----------------------------- Initialization --------------------------------

function init() {
  // Build new world or load
  generateWorld();
  const didLoad = load();

  // Migrate decor to new categories/kinds and wire spritesheets
  migrateDecorTypes();

  // Ensure any pre-existing path tiles are removed
  removePathsFromWorld();

  // Prune saved trees by ~50% once
  pruneTreesByHalfOnce();
  removeDefaultSeedsOnce();

  // Ensure a username exists and enable editing in Profile
  ensureUsername();
  setupUsernameEditing();
  setupUsernameModal();

  // Ensure Prophecy Seller exists on loaded worlds as well (fixed at 128,59)
  try {
    const hasSeller = Array.isArray(Game.decor) && Game.decor.some(d => d && d.type === 'npc' && (d.name === 'Prophecy Seller' || d.role === 'seller'));
    if (!hasSeller && window.Customization && typeof window.Customization.spawnNPC === 'function') {
      window.Customization.spawnNPC(128, 59, 'Prophecy Seller', { role: 'seller' });
      save();
    }
  } catch (e) {}

  // Build minimap base from current world
  try { buildMinimapBase(); } catch (e) {}

  if (!didLoad) {
    save();
  }

  // UI
  updateInventoryUI();
  updateHUD();
  Mechanics.init();
  ensureSkills();
  updateSkillsModal();

  // Kick off initial Supabase sync (creates profile, stores coords, updates balances)
  try { syncSupabaseInitial(); } catch (e) {}
  try { initPresence(); } catch (e) {}

  // Set default tool active
  setTool(Game.tool);

  // Expose spritesheet API from generateWorld scope to drawDecor
  if (!window.__SpriteSheetAPI) {
    // If not already created by migrate, create a minimal passthrough that will be set at first generate
    window.__SpriteSheetAPI = {
      request: () => {},
      get: () => null,
    };
  }

  // Start loop
  setupBGM();
  requestAnimationFrame(loop);
}

if (window.Preloader && typeof window.Preloader.waitUntilReady === 'function') {
  window.Preloader.waitUntilReady(init);
} else if (window.Preloader && window.Preloader.ready && typeof window.Preloader.ready.then === 'function') {
  window.Preloader.ready.then(init).catch(() => init());
} else {
  init();
}

// ----------------------------- Expandability Notes ---------------------------
/*
Future systems can hook into this structure:
- Animals: add new entity layer with AI update step and rendering pass
- Crafting: add recipes and a crafting UI; items can be added to inventory.inv
- Quests: add a quest log and trigger checks on interactFront() or growth events
- NPCs/Town: add additional maps or off-farm areas; portal tiles into new scenes
- Weather: influence watering duration or growth speed
- Time of day (optional): visual lighting only (no day ticks required)
*/

// ----------------------------- END -------------------------------------------
