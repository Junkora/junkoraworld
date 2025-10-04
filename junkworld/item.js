/* 
  Item System (Trees, Flowers, Minerals) with Rarity + Quality

  Rarity:
    - Godlike:   0.01%
    - Mythic:    1%
    - Legendary: 10%
    - Rare:      25%
    - Uncommon:  50%
    - Common:    80%

  Because these percentages sum to > 100%, this implementation uses a top-down cascade:
    1) Try Godlike @ 0.01%
    2) If not, try Mythic @ 1%
    3) If not, try Legendary @ 10%
    4) If not, try Rare @ 25%
    5) If not, try Uncommon @ 50%
    6) If none pass, fallback to Common
  This guarantees exactly one rarity per gather while honoring the given per-step chances.

  Quality (sums to 100%):
    - Dull:      60%
    - Normal:    30%
    - Refined:    8%
    - Pristine:   1.5%
    - Exquisite:  0.5%

  API (Global):
    window.ItemSystem.gather(category, nodeName, options?)
      - category: 'tree' | 'flower' | 'mineral'
      - nodeName: e.g. 'Apple Tree' or 'Apple' (tree), 'Rose' (flower), 'Copper Ore' (mineral)
      - options: { rng?: () => number }
      Returns:
        {
          id: string,
          category: 'tree'|'flower'|'mineral',
          source: string,   // the nodeName provided
          name: string,     // the gathered item inferred from node
          rarity: string,   // Common | Uncommon | Rare | Legendary | Mythic | Godlike
          quality: string,  // Dull | Normal | Refined | Pristine | Exquisite
          createdAt: number,
          icon: string      // asset path if known (may be empty for wood)
        }

    window.ItemSystem.rollRarity()  // utility
    window.ItemSystem.rollQuality() // utility
    window.ItemSystem.categories    // { TREE, FLOWER, MINERAL }
    window.ItemSystem.rarities      // array of rarity names
    window.ItemSystem.qualities     // array of quality names

  Example:
    const item = ItemSystem.gather('tree', 'Apple Tree');
    console.log(item);
*/

const ItemSystem = (() => {
  const Categories = {
    TREE: 'tree',
    FLOWER: 'flower',
    MINERAL: 'mineral',
  };

  // Top-down cascade order (rarest to commonest)
  const RARITIES = [
    { name: 'Godlike',   chance: 0.0001, color: '#B44CFF' }, // 0.01%
    { name: 'Mythic',    chance: 0.01,   color: '#FF33AA' }, // 1%
    { name: 'Legendary', chance: 0.10,   color: '#FF9900' }, // 10%
    { name: 'Rare',      chance: 0.25,   color: '#3399FF' }, // 25%
    { name: 'Uncommon',  chance: 0.50,   color: '#33CC66' }, // 50%
    { name: 'Common',    chance: 0.80,   color: '#BBBBBB' }, // 80% (used as fallback name)
  ];

  // Exact distribution (sums to 1.0)
  const QUALITIES = [
    { name: 'Dull',      weight: 0.60 },
    { name: 'Normal',    weight: 0.30 },
    { name: 'Refined',   weight: 0.08 },
    { name: 'Pristine',  weight: 0.015 },
    { name: 'Exquisite', weight: 0.005 },
  ];

  // Canonical tree name sets to infer item names.
  const FRUIT_TREES = new Set(['Apple', 'Lemon', 'Mango', 'Orange', 'Peach', 'Coconut']);
  const WOOD_TREES  = new Set(['Birch', 'Maple', 'Oak', 'Pine', 'Willow', 'Jacaranda']);
  const BLOSSOM_TREES = new Map([
    ['Sakura', 'Sakura Blossom'],
  ]);

  function rollRarityCascade(rng = Math.random) {
    // Try from rarest to commonest; fallback to 'Common'
    for (let i = 0; i < RARITIES.length; i++) {
      const r = RARITIES[i];
      // The final 'Common' row represents its nominal chance but we use it as a fallback name,
      // so we do not attempt its 80% roll here. We break out before attempting it.
      if (r.name === 'Common') break;
      if (rng() < r.chance) return r.name;
    }
    return 'Common';
  }

  function rollQuality(rng = Math.random) {
    const roll = rng();
    let acc = 0;
    for (const q of QUALITIES) {
      acc += q.weight; // total sums to 1
      if (roll < acc) return q.name;
    }
    return QUALITIES[QUALITIES.length - 1].name;
  }

  function normalizeNodeName(name) {
    return String(name || '').trim();
  }

  function baseTreeName(nodeName) {
    const base = normalizeNodeName(nodeName).replace(/\s*(tree|Tree)$/g, '').trim();
    return base;
  }

  function inferTreeItem(nodeName) {
    const base = baseTreeName(nodeName);
    if (FRUIT_TREES.has(base)) return base; // fruit item (e.g., 'Apple')
    if (BLOSSOM_TREES.has(base)) return BLOSSOM_TREES.get(base); // blossom item
    if (WOOD_TREES.has(base)) return `${base} Wood`; // wood item
    // Fallback: treat unknown tree as wood of that name
    return `${base} Wood`;
  }

  function inferFlowerItem(nodeName) {
    // For flowers, the item is the flower itself.
    return normalizeNodeName(nodeName);
  }

  function inferMineralItem(nodeName) {
    // For minerals/ores/gems, the item is the node name as given.
    return normalizeNodeName(nodeName);
  }

  function assetPath(category, itemName) {
    // Best-effort icon resolution (optional)
    switch (category) {
      case Categories.FLOWER:
        return `assets/flower/${itemName}.png`;
      case Categories.MINERAL:
        return `assets/minerals/${itemName}.png`;
      case Categories.TREE: {
        // Tree fruits and blossoms have icons in assets/tree
        if (FRUIT_TREES.has(itemName)) return `assets/tree/${itemName}.png`;
        if (itemName === 'Sakura Blossom') return 'assets/tree/Sakura.png';
        // No wood icons provided; return empty string
        return '';
      }
      default:
        return '';
    }
  }

  let idSeq = 1;
  function makeId() {
    return `itm_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;
  }

  function gather(category, nodeName, options = {}) {
    if (!category) throw new Error('gather(category, nodeName): category is required.');
    if (!nodeName) throw new Error('gather(category, nodeName): nodeName is required.');

    const rng = options.rng || Math.random;
    const cat = String(category).toLowerCase();

    let itemName;
    if (cat === Categories.TREE) {
      itemName = inferTreeItem(nodeName);
    } else if (cat === Categories.FLOWER) {
      itemName = inferFlowerItem(nodeName);
    } else if (cat === Categories.MINERAL) {
      itemName = inferMineralItem(nodeName);
    } else {
      throw new Error(`Unknown category '${category}'. Use 'tree', 'flower', or 'mineral'.`);
    }

    const rarity = rollRarityCascade(rng);
    const quality = rollQuality(rng);

    return {
      id: makeId(),
      category: cat,
      source: normalizeNodeName(nodeName),
      name: itemName,
      rarity,
      quality,
      createdAt: Date.now(),
      icon: assetPath(cat, itemName),
    };
  }

  return {
    gather,
    rollRarity: () => rollRarityCascade(),
    rollQuality: () => rollQuality(),
    categories: Categories,
    rarities: RARITIES.map(r => r.name),
    qualities: QUALITIES.map(q => q.name),
  };
})();

// Expose globally for non-module usage
if (typeof window !== 'undefined') {
  window.ItemSystem = ItemSystem;
}

// Optional: CommonJS export if ever used in tests/tooling
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ItemSystem };
}
