/* Customization System for Land Tileset, Trees, Rocks, and Flowers
   This file provides a flexible way to customize the visual appearance and properties
   of all decorative elements in the game.
*/

// Customizable tileset definitions
const CUSTOM_TILESET = {
  // Land tiles - base layer
  grass: {
    baseColor: '#3f463c', // Original: grimy moss/grass
    noiseVariation: 0.08,
    grungeSpeckles: true,
    oilStains: false,
    toxicRipples: false,
    displayName: 'Grass'
  },
  soil: {
    baseColor: '#2f231a', // Original: oily mud
    noiseVariation: 0.08,
    grungeSpeckles: true,
    oilStains: true,
    toxicRipples: false,
    displayName: 'Soil'
  },
  path: {
    baseColor: '#3b3b3f', // Original: cracked asphalt
    noiseVariation: 0.06,
    grungeSpeckles: true,
    oilStains: true,
    toxicRipples: false,
    displayName: 'Path'
  },
  water: {
    baseColor: '#2a5d4f', // Original: toxic green-blue
    noiseVariation: 0.10,
    grungeSpeckles: true,
    oilStains: false,
    toxicRipples: true,
    displayName: 'Water'
  },
  
  // NPC decoration (static sprite using character idle sheet)
  npc: {
    name: 'NPC',
    walkable: false,
    canInteract: true,
    displayName: 'NPC',
    spriteSrc: 'assets/character/idle.png',
    _img: null,
    draw: function(ctx, px, py, tileSize) {
      // Lazy-load sprite once
      if (!this._img) {
        const img = new Image();
        img.src = this.spriteSrc;
        this._img = img;
      }
      const img = this._img;
      if (img && img.complete) {
        const size = Math.floor(tileSize * 1.25);
        // Draw first frame (64x64) of the idle sheet, bottom-aligned to tile
        ctx.drawImage(img, 0, 0, 64, 64, px + tileSize / 2 - size / 2, py + tileSize - size, size, size);
      } else {
        // Fallback placeholder
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(px + tileSize / 2, py + tileSize / 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

// Customizable decoration definitions
const CUSTOM_DECORATIONS = {
  tree: {
    // Visual properties
    trunkColor: '#3a2e24',
    trunkWidth: 4,
    trunkHeight: 10,
    canopyColor: '#4b3d33',
    canopyRadius: 10,
    branchColor: 'rgba(0,0,0,0.3)',
    branchWidth: 2,
    
    // Game properties
    walkable: false,
    canInteract: false,
    displayName: 'Dead Tree',
    
    // Custom drawing function
    draw: function(ctx, px, py, tileSize) {
      // Trunk
      ctx.fillStyle = this.trunkColor;
      ctx.fillRect(px + tileSize / 2 - this.trunkWidth / 2, py + tileSize - this.trunkHeight, this.trunkWidth, this.trunkHeight);
      
      // Canopy
      ctx.fillStyle = this.canopyColor;
      ctx.beginPath();
      ctx.arc(px + tileSize / 2, py + tileSize / 2 - 2, this.canopyRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Branch
      ctx.strokeStyle = this.branchColor;
      ctx.lineWidth = this.branchWidth;
      ctx.beginPath();
      ctx.moveTo(px + tileSize / 2, py + tileSize / 2 - 12);
      ctx.lineTo(px + tileSize / 2 + 6, py + tileSize / 2 - 4);
      ctx.stroke();
    }
  },
  
  flower: {
    // Visual properties
    bagColor: '#31343a',
    knotColor: '#202227',
    reflectiveColor: '#00e0ff',
    bagWidth: 18,
    bagHeight: 12,
    
    // Game properties
    walkable: true,
    canInteract: false,
    displayName: 'Trash Bag',
    
    // Custom drawing function
    draw: function(ctx, px, py, tileSize) {
      // Trash bag
      ctx.fillStyle = this.bagColor;
      ctx.beginPath();
      ctx.ellipse(px + tileSize / 2, py + tileSize - 8, this.bagWidth / 2, this.bagHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Bag knot
      ctx.fillStyle = this.knotColor;
      ctx.fillRect(px + tileSize / 2 - 2, py + tileSize - 14, 4, 6);
      
      // Reflective shard
      ctx.fillStyle = this.reflectiveColor;
      ctx.fillRect(px + tileSize / 2 + 4, py + tileSize - 12, 2, 2);
    }
  },
  
  rock: {
    // Visual properties
    color: '#6f7278',
    points: [
      { x: 8, y: -6 },
      { x: tileSize - 6, y: -10 },
      { x: tileSize - 10, y: -4 }
    ],
    
    // Game properties
    walkable: false,
    canInteract: false,
    displayName: 'Rubble',
    
    // Custom drawing function
    draw: function(ctx, px, py, tileSize) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + tileSize - 6);
      ctx.lineTo(px + tileSize - 6, py + tileSize - 10);
      ctx.lineTo(px + tileSize - 10, py + tileSize - 4);
      ctx.closePath();
      ctx.fill();
    }
  }
};

// Advanced customization: Add new decoration types
const CUSTOM_DECORATION_TYPES = {
  // Example: Add a bush decoration
  bush: {
    color: '#2d4a2c',
    height: 12,
    width: 16,
    walkable: true,
    canInteract: false,
    displayName: 'Bush',
    draw: function(ctx, px, py, tileSize) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(px + tileSize / 2, py + tileSize - this.height / 2, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  
  // Example: Add a mushroom decoration
  mushroom: {
    capColor: '#ff6b6b',
    stemColor: '#f0e68c',
    capRadius: 6,
    stemWidth: 4,
    stemHeight: 8,
    walkable: true,
    canInteract: false,
    displayName: 'Mushroom',
    draw: function(ctx, px, py, tileSize) {
      // Cap
      ctx.fillStyle = this.capColor;
      ctx.beginPath();
      ctx.arc(px + tileSize / 2, py + tileSize - this.stemHeight - this.capRadius, this.capRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Stem
      ctx.fillStyle = this.stemColor;
      ctx.fillRect(px + tileSize / 2 - this.stemWidth / 2, py + tileSize - this.stemHeight, this.stemWidth, this.stemHeight);
    }
  }
};

// Customization utility functions
function getCustomTile(tileId) {
  const tileNames = ['grass', 'soil', 'path', 'water'];
  const tileName = tileNames[tileId];
  return CUSTOM_TILESET[tileName] || CUSTOM_TILESET.grass;
}

function getCustomDecoration(decorType) {
  // Special-case NPC which is defined under CUSTOM_TILESET for convenience
  if (decorType === 'npc' && CUSTOM_TILESET.npc) {
    return CUSTOM_TILESET.npc;
  }
  // Check main decorations first
  if (CUSTOM_DECORATIONS[decorType]) {
    return CUSTOM_DECORATIONS[decorType];
  }
  // Check additional decoration types
  if (CUSTOM_DECORATION_TYPES[decorType]) {
    return CUSTOM_DECORATION_TYPES[decorType];
  }
  // Fallback to tree if unknown type
  return CUSTOM_DECORATIONS.tree;
}

// Function to add new decoration to world
function addCustomDecoration(x, y, decorType, nameOrData, data) {
  // Support: addCustomDecoration(x,y,type)
  //          addCustomDecoration(x,y,type, 'Name')
  //          addCustomDecoration(x,y,type, { name:'Name', ...meta })
  //          addCustomDecoration(x,y,type, 'Name', { ...meta })
  let name = null;
  let meta = null;
  if (typeof nameOrData === 'string') {
    name = nameOrData;
  } else if (nameOrData && typeof nameOrData === 'object') {
    name = nameOrData.name || null;
    meta = { ...nameOrData };
    if ('name' in meta) delete meta.name;
  }
  if (data && typeof data === 'object') {
    meta = { ...(meta || {}), ...data };
  }

  const decor = { x, y, type: decorType };
  if (name) decor.name = name;
  if (meta) Object.assign(decor, meta);
  Game.decor.push(decor);

  // Update tile walkable property if needed
  const tile = tileAt(x, y);
  if (tile) {
    const customDecor = getCustomDecoration(decorType);
    tile.walkable = customDecor.walkable !== false;
  }

  save();
}

// Function to remove decoration
function removeCustomDecoration(x, y) {
  Game.decor = Game.decor.filter(d => !(d.x === x && d.y === y));
  
  // Restore tile walkable property (assume grass tile is walkable)
  const tile = tileAt(x, y);
  if (tile) {
    tile.walkable = true;
  }
  
  save();
}
  
// Convenience: spawn an NPC at tile (x,y)
function spawnNPC(x, y, name = 'Prophecy Seller', meta = {}) {
  try {
    addCustomDecoration(x, y, 'npc', name, { role: 'seller', ...meta });
  } catch (e) {
    console.warn('spawnNPC failed:', e);
  }
}
  
// Customization examples and presets
const CUSTOMIZATION_PRESETS = {
  // Clean, natural theme
  natural: {
    tileset: {
      grass: { baseColor: '#4a7c59', noiseVariation: 0.12 },
      soil: { baseColor: '#8B4513', noiseVariation: 0.08, oilStains: false },
      path: { baseColor: '#A0522D', noiseVariation: 0.06, oilStains: false },
      water: { baseColor: '#4682B4', noiseVariation: 0.10, toxicRipples: false }
    },
    decorations: {
      tree: { trunkColor: '#8B4513', canopyColor: '#228B22' },
      flower: { 
        bagColor: '#90EE90', 
        knotColor: '#32CD32', 
        reflectiveColor: '#FFFFFF',
        displayName: 'Flower'
      },
      rock: { color: '#696969' }
    }
  },
  
  // Desert theme
  desert: {
    tileset: {
      grass: { baseColor: '#D2B48C', noiseVariation: 0.08 },
      soil: { baseColor: '#CD853F', noiseVariation: 0.10, oilStains: false },
      path: { baseColor: '#A0522D', noiseVariation: 0.06, oilStains: false },
      water: { baseColor: '#87CEEB', noiseVariation: 0.10, toxicRipples: false }
    },
    decorations: {
      tree: { trunkColor: '#8B4513', canopyColor: '#DAA520', displayName: 'Cactus' },
      flower: { 
        bagColor: '#FFD700', 
        knotColor: '#FFA500', 
        reflectiveColor: '#FFFFFF',
        displayName: 'Desert Flower'
      },
      rock: { color: '#8B4513' }
    }
  },
  
  // Fantasy theme
  fantasy: {
    tileset: {
      grass: { baseColor: '#32CD32', noiseVariation: 0.15 },
      soil: { baseColor: '#654321', noiseVariation: 0.08, oilStains: false },
      path: { baseColor: '#808080', noiseVariation: 0.08, oilStains: false },
      water: { baseColor: '#1E90FF', noiseVariation: 0.12, toxicRipples: true }
    },
    decorations: {
      tree: { trunkColor: '#8B4513', canopyColor: '#00FF00', branchColor: '#0000FF' },
      flower: { 
        bagColor: '#FF69B4', 
        knotColor: '#FF1493', 
        reflectiveColor: '#FF00FF',
        displayName: 'Magic Flower'
      },
      rock: { color: '#4B0082' }
    }
  }
};

// Apply customization preset
function applyCustomizationPreset(presetName) {
  if (!CUSTOMIZATION_PRESETS[presetName]) {
    console.warn(`Preset "${presetName}" not found. Available presets: ${Object.keys(CUSTOMIZATION_PRESETS).join(', ')}`);
    return;
  }
  
  const preset = CUSTOMIZATION_PRESETS[presetName];
  
  // Apply tileset changes
  if (preset.tileset) {
    Object.keys(preset.tileset).forEach(tileName => {
      if (CUSTOM_TILESET[tileName]) {
        Object.assign(CUSTOM_TILESET[tileName], preset.tileset[tileName]);
      }
    });
  }
  
  // Apply decoration changes
  if (preset.decorations) {
    Object.keys(preset.decorations).forEach(decorName => {
      if (CUSTOM_DECORATIONS[decorName]) {
        Object.assign(CUSTOM_DECORATIONS[decorName], preset.decorations[decorName]);
      }
    });
  }
  
  console.log(`Applied customization preset: ${presetName}`);
}

// Export customization system
window.Customization = {
  tileset: CUSTOM_TILESET,
  decorations: CUSTOM_DECORATIONS,
  additionalDecorations: CUSTOM_DECORATION_TYPES,
  presets: CUSTOMIZATION_PRESETS,
  getCustomTile,
  getCustomDecoration,
  addCustomDecoration,
  removeCustomDecoration,
  spawnNPC,
  applyCustomizationPreset
};
