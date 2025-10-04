// mechanics.js - Stamina system and multi-currency management

const Mechanics = {
  stamina: {
    max: 100,
    current: 100
  },
  currencies: {
    cash: 50,
    junk: 0,
    ada: 0
  },
  drain(amount) {
    this.stamina.current = Math.max(0, this.stamina.current - amount);
    updateStaminaUI();
  },
  regen(amount) {
    this.stamina.current = Math.min(this.stamina.max, this.stamina.current + amount);
    updateStaminaUI();
  },
  addCurrency(type, amount) {
    if (this.currencies.hasOwnProperty(type)) {
      this.currencies[type] += amount;
    }
    updateCurrenciesUI();
  },
  init() {
    // Preserve any loaded state from Game (e.g., from save/load) and link references
    if (Game.stamina) {
      this.stamina = Game.stamina;
    } else {
      Game.stamina = this.stamina;
    }

    if (Game.currencies) {
      this.currencies = Game.currencies;
    } else {
      Game.currencies = this.currencies;
    }

    Game.drainStamina = this.drain.bind(this);
    Game.regenStamina = this.regen.bind(this);
    Game.addCurrency = this.addCurrency.bind(this);

    updateStaminaUI();
    updateCurrenciesUI();
  }
};

const STAMINA_REGEN_INTERVAL_MS = 5 * 60 * 1000; // 1 stamina per 5 minutes
Mechanics.__regenTimer = null;

/* Apply offline/idle catch-up based on lastRegenAt timestamp */
Mechanics.__applyStaminaCatchup = function() {
  try {
    if (!this.stamina) return;
    if (typeof this.stamina.lastRegenAt !== 'number') {
      this.stamina.lastRegenAt = Date.now();
      return;
    }
    const now = Date.now();
    let elapsed = now - this.stamina.lastRegenAt;
    if (elapsed < STAMINA_REGEN_INTERVAL_MS) return;

    // If already full, advance baseline so time doesn't accumulate
    if (this.stamina.current >= this.stamina.max) {
      this.stamina.lastRegenAt = now;
      return;
    }

    const ticks = Math.floor(elapsed / STAMINA_REGEN_INTERVAL_MS);
    if (ticks > 0) {
      const room = Math.max(0, this.stamina.max - this.stamina.current);
      const add = Math.min(ticks, room);
      if (add > 0) this.regen(add);
      // move baseline forward by consumed ticks
      this.stamina.lastRegenAt = this.stamina.lastRegenAt + ticks * STAMINA_REGEN_INTERVAL_MS;
      try { if (typeof save === 'function') save(); } catch (e) {}
    }
  } catch (e) {}
};

/* Start periodic regen using timestamp math (robust to focus/blur) */
Mechanics.__startStaminaRegen = function() {
  try {
    if (this.__regenTimer) clearInterval(this.__regenTimer);
  } catch (e) {}

  const tick = () => {
    try {
      if (!this.stamina) return;
      const now = Date.now();
      if (typeof this.stamina.lastRegenAt !== 'number') this.stamina.lastRegenAt = now;

      const delta = now - this.stamina.lastRegenAt;
      const ticks = Math.floor(delta / STAMINA_REGEN_INTERVAL_MS);
      if (ticks > 0) {
        if (this.stamina.current < this.stamina.max) {
          const room = Math.max(0, this.stamina.max - this.stamina.current);
          const add = Math.min(ticks, room);
          if (add > 0) this.regen(add);
        }
        // Always advance baseline to avoid infinite backlog
        this.stamina.lastRegenAt = this.stamina.lastRegenAt + ticks * STAMINA_REGEN_INTERVAL_MS;
        try { if (typeof save === 'function') save(); } catch (e) {}
      }
    } catch (e) {}
  };

  // First catch-up shortly after init, then poll every 30s
  setTimeout(tick, 1000);
  this.__regenTimer = setInterval(tick, 30000);
};

/* Hook into Mechanics.init to enable regen automatically */
(function(){
  const _origInit = Mechanics.init;
  Mechanics.init = function() {
    _origInit.call(this);
    try {
      if (!this.stamina) this.stamina = { max: 100, current: 100 };
      if (typeof this.stamina.lastRegenAt !== 'number') this.stamina.lastRegenAt = Date.now();
      this.__applyStaminaCatchup();
      this.__startStaminaRegen();
    } catch (e) {}
  };
})();

function updateStaminaUI() {
  const bar = document.getElementById('stamina-fill');
  if (bar) {
    const percent = (Mechanics.stamina.current / Mechanics.stamina.max) * 100;
    bar.style.width = percent + '%';
  }
  const text = document.getElementById('stamina-text');
  if (text) {
    text.textContent = `Stamina: ${Math.round(Mechanics.stamina.current)}/${Mechanics.stamina.max}`;
  }
}

function updateCurrenciesUI() {
  const cashEl = document.getElementById('cash-display');
  if (cashEl) {
    cashEl.textContent = `Cash: ${Mechanics.currencies.cash}`;
  }
  const junkEl = document.getElementById('junk-display');
  if (junkEl) {
    junkEl.textContent = `$JUNK: ${Mechanics.currencies.junk}`;
  }
  const adaEl = document.getElementById('ada-display');
  if (adaEl) {
    adaEl.textContent = `$ADA: ${Mechanics.currencies.ada}`;
  }
}
