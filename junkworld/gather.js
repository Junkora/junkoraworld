/*
  Gather System
  - Easy harvesting API built on top of ItemList (customizable tuples) and ItemSystem (rarity/quality rolls).
  - Uses ItemList tuple format: [itemID, name, imageLink]
  - Supports categories: 'tree', 'flower', 'mineral'
  - Public API (global):
      GatherSystem.harvest(category, nodeName)
      GatherSystem.harvestTree(nodeName)
      GatherSystem.harvestFlower(nodeName)
      GatherSystem.harvestMineral(nodeName)

  Returns an object:
    {
      instanceId: string,      // unique per harvest
      itemID: string,          // stable id from ItemList
      name: string,            // item name from ItemList
      imageLink: string,       // icon path from ItemList (may be empty for wood)
      category: 'tree'|'flower'|'mineral',
      source: string,          // the node name you harvested from
      rarity: string,          // via ItemSystem.rollRarity()
      quality: string,         // via ItemSystem.rollQuality()
      createdAt: number
    }

  Conventions:
  - Trees:
      * Fruit trees yield fruit item (e.g., 'Apple')
      * Sakura yields 'Sakura Blossom'
      * Wood-only trees yield '<Name> Wood' (e.g., 'Birch Wood')
  - Flowers:
      * Yield petals as '<Name> Petals' (e.g., 'Rose Petals')
  - Minerals:
      * Yield the mineral/ore/gem as named in assets (e.g., 'Copper Ore', 'Diamond')
*/

(function () {
  function ensureDeps() {
    if (typeof window === "undefined") return;
    if (!window.ItemList) {
      throw new Error("GatherSystem requires ItemList (itemlist.js) to be loaded first.");
    }
    if (!window.ItemSystem) {
      throw new Error("GatherSystem requires ItemSystem (item.js) to be loaded first.");
    }
  }

  function normalizeName(name) {
    return String(name || "").trim();
  }

  function baseTreeName(nodeName) {
    return normalizeName(nodeName).replace(/\s*(tree|Tree)$/g, "").trim();
  }

  function makeInstanceIdFactory(prefix) {
    let seq = 1;
    return function make() {
      return `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;
    };
  }
  const makeInstanceId = makeInstanceIdFactory("gth");

  function resolveTreeTuple(nodeName) {
    const base = baseTreeName(nodeName);
    const sakura = /^sakura$/i.test(base);
    let itemName;

    // Priority: Sakura Blossom -> Fruit -> Wood
    if (sakura) {
      itemName = "Sakura Blossom";
    } else {
      // Check if base is a fruit in the ItemList (e.g., 'Apple', 'Mango', etc.)
      const fruit = window.ItemList.findByName("trees", base);
      if (fruit) {
        return fruit; // [id, 'Apple', 'assets/tree/Apple.png']
      }
      // Otherwise wood form
      itemName = `${base} Wood`;
    }

    const tuple = window.ItemList.findByName("trees", itemName);
    if (tuple) return tuple;

    // Fallback if not in list: add it dynamically for consistency
    let icon = "";
    if (itemName === "Sakura Blossom") {
      icon = "assets/tree/Sakura.png";
    } else {
      // Fruit case would have returned above; wood has no dedicated icon
      icon = "";
    }
    const id = window.ItemList.makeId("tree_fallback", itemName);
    window.ItemList.add("trees", [id, itemName, icon]);
    return [id, itemName, icon];
  }

  function resolveFlowerTuple(nodeName) {
    const base = normalizeName(nodeName);
    const itemName = `${base} Petals`;
    const tuple = window.ItemList.findByName("flowers", itemName);
    if (tuple) return tuple;

    // Fallback: create petals entry with flower icon
    const icon = `assets/flower/${base}.png`;
    const id = window.ItemList.makeId("flower_fallback", itemName);
    window.ItemList.add("flowers", [id, itemName, icon]);
    return [id, itemName, icon];
  }

  function resolveMineralTuple(nodeName) {
    const base = normalizeName(nodeName);
    const tuple = window.ItemList.findByName("minerals", base);
    if (tuple) return tuple;

    // Fallback: create mineral entry with a guessed icon path
    const icon = `assets/minerals/${base}.png`;
    const id = window.ItemList.makeId("mineral_fallback", base);
    window.ItemList.add("minerals", [id, base, icon]);
    return [id, base, icon];
  }

  // Resolve a resource-specific Seed tuple (misc category). Creates it if missing.
  function resolveResourceSeedTuple(cat, nodeName) {
    try {
      if (cat === "tree") {
        const base = baseTreeName(nodeName);
        const seedName = `${base} Seed`;
        let t = window.ItemList.findByName("misc", seedName);
        if (t) return t;
        const id = window.ItemList.makeId("misc", seedName);
        window.ItemList.add("misc", [id, seedName, ""]);
        return [id, seedName, ""];
      } else if (cat === "flower") {
        const base = normalizeName(nodeName);
        const seedName = `${base} Seed`;
        let t = window.ItemList.findByName("misc", seedName);
        if (t) return t;
        const id = window.ItemList.makeId("misc", seedName);
        window.ItemList.add("misc", [id, seedName, ""]);
        return [id, seedName, ""];
      }
    } catch (e) {}
    return null;
  }

  function harvest(category, nodeName) {
    ensureDeps();

    const cat = String(category || "").toLowerCase();
    const source = normalizeName(nodeName);
    if (!cat) throw new Error("harvest(category, nodeName): category is required.");
    if (!source) throw new Error("harvest(category, nodeName): nodeName is required.");

    // Resolve item tuple from ItemList by category + name conventions
    let tuple;
    if (cat === "tree") {
      tuple = resolveTreeTuple(source);
    } else if (cat === "flower") {
      tuple = resolveFlowerTuple(source);
    } else if (cat === "mineral") {
      tuple = resolveMineralTuple(source);
    } else {
      throw new Error("Unknown category. Use 'tree', 'flower', or 'mineral'.");
    }

    // Rarity + Quality via ItemSystem utilities
    const rarity = window.ItemSystem.rollRarity();
    const quality = window.ItemSystem.rollQuality();

    // 2% chance bonus: resource-specific Seed (Trees/Flowers only)
    const bonusItems = [];
    try {
      if ((cat === "tree" || cat === "flower") && Math.random() < 0.02) {
        const seed = resolveResourceSeedTuple(cat, source);
        if (seed) {
          bonusItems.push({
            itemID: seed[0],
            name: seed[1],
            imageLink: seed[2],
            quantity: 1,
          });
        }
      }
    } catch (e) {}

    return {
      instanceId: makeInstanceId(),
      itemID: tuple[0],
      name: tuple[1],
      imageLink: tuple[2],
      category: cat,
      source,
      rarity,
      quality,
      createdAt: Date.now(),
      bonusItems,
    };
  }

  const GatherSystem = {
    harvest,
    harvestTree(nodeName) {
      return harvest("tree", nodeName);
    },
    harvestFlower(nodeName) {
      return harvest("flower", nodeName);
    },
    harvestMineral(nodeName) {
      return harvest("mineral", nodeName);
    },
  };

  if (typeof window !== "undefined") {
    window.GatherSystem = GatherSystem;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { GatherSystem };
  }
})();
