/*
  Item List (easy to customize)
  - Each item uses the tuple format: [itemID, name, imageLink]
  - Categories: trees, flowers, minerals
  - itemID is a stable slug so you can reference an item reliably in code.

  Example entry:
    ["tree_fruit_apple", "Apple", "assets/tree/Apple.png"]

  You can add/remove entries below or push more at runtime using ItemList.add(category, [id, name, img]).
*/

(function () {
  function slug(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function makeId(prefix, name) {
    return prefix + "_" + slug(name);
  }

  // Public API
  const ItemList = {
    // Arrays of [itemID, name, imageLink]
    trees: [],
    flowers: [],
    minerals: [],
    misc: [],

    // id -> [itemID, name, imageLink]
    byId: {},

    // Helpers
    add(category, tuple) {
      if (!this[category]) throw new Error("Unknown category: " + category);
      this[category].push(tuple);
      this.byId[tuple[0]] = tuple;
    },
    findByName(category, name) {
      const arr = this[category] || [];
      const target = String(name || "").trim().toLowerCase();
      return (
        arr.find((e) => e[1].toLowerCase() === target) || null
      );
    },
    findById(id) {
      return this.byId[id] || null;
    },
    makeId,
    slug,
  };

  // Trees
  // Fruits (icons available in assets/tree/*.png)
  const TREE_FRUITS = ["Apple", "Lemon", "Mango", "Orange", "Peach", "Coconut"];
  TREE_FRUITS.forEach((n) => {
    ItemList.add("trees", [makeId("tree_fruit", n), n, `assets/tree/${n}.png`]);
  });

  // Wood resources (no specific wood icons provided; image left empty by design)
  const TREE_WOODS = ["Birch", "Maple", "Oak", "Pine", "Willow", "Jacaranda"];
  TREE_WOODS.forEach((n) => {
    const name = `${n} Wood`;
    ItemList.add("trees", [makeId("tree_wood", name), name, ""]);
  });

  // Blossom-type
  const TREE_BLOSSOMS = [{ tree: "Sakura", item: "Sakura Blossom", icon: "assets/tree/Sakura.png" }];
  TREE_BLOSSOMS.forEach(({ item, icon }) => {
    ItemList.add("trees", [makeId("tree_blossom", item), item, icon]);
  });

  // Flowers (gather petals, icons use the flower image)
  const FLOWERS = ["Daisy", "Lotus", "Orchid", "Rose", "Sunflower", "Tulip"];
  FLOWERS.forEach((n) => {
    const itemName = `${n} Petals`;
    ItemList.add("flowers", [makeId("flower_petals", itemName), itemName, `assets/flower/${n}.png`]);
  });

  // Minerals (icons available in assets/minerals/*.png)
  const MINERALS = [
    "Adamantite",
    "Amethyst",
    "Basalt",
    "Coal",
    "Copper Ore",
    "Diamond",
    "Emerald",
    "Gold Ore",
    "Granite",
    "Iron Ore",
    "Limestone",
    "Marble",
    "Mooncrystal",
    "Mythril",
    "Obsidian",
    "Opal",
    // file is "rock.png" (lowercase)
    { name: "Rock", file: "rock" },
    "Ruby",
    "Sandstone",
    "Sapphire",
    "Silver Ore",
    "Slate",
    "Starstone",
    "Tin Ore",
    "Topaz",
  ];

  MINERALS.forEach((m) => {
    const display = typeof m === "string" ? m : m.name;
    const fileName = typeof m === "string" ? m : m.file;
    ItemList.add("minerals", [
      makeId("mineral", display),
      display,
      `assets/minerals/${fileName}.png`,
    ]);
  });

  // Misc items
  ItemList.add("misc", [makeId("misc", "SEED"), "SEED", ""]);

  // Expose globally
  if (typeof window !== "undefined") {
    window.ItemList = ItemList;
  }
  // Optional: CommonJS
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ItemList };
  }
})();
