/* wallet.js - Cardano wallet linking (CIP-30)
   - Detects installed Cardano wallets (Nami, Eternl, Lace, Flint, etc.)
   - Connects and stores minimal state (wallet key, name, networkId, first address hex)
   - Updates Profile modal UI (Link Wallet / Disconnect + status + wallet row)
   - No on-chain calls; Blockfrost API key provided can be used later if needed
*/

(function () {
  'use strict';

  // If Blockfrost is needed later for on-chain reads, this key is available.
  // Currently unused (pure CIP-30 linking only).
  const BLOCKFROST_API_KEY = 'mainnetKNXm9OwdwjoxvmzeI1yhjRukhkHsVmkc';
  const BLOCKFROST_API_URL = 'https://cardano-mainnet.blockfrost.io/api/v0';

  const STORAGE_KEY = 'junkora-wallet-link';
  const PREFERRED_ORDER = [
    'nami',
    'eternl',
    'lace',
    'flint',
    'gero',
    'yoroi',
    'typhoncip30',
    'nufi',
    'begin',
    'vespr',
    'tangem',
  ];

  function getCardano() {
    return (typeof window !== 'undefined' && window.cardano) ? window.cardano : {};
  }

  function detectWallets() {
    const c = getCardano();
    const found = [];
    // Known keys in preferred order first
    for (const key of PREFERRED_ORDER) {
      try {
        const w = c[key];
        if (w && typeof w.enable === 'function') {
          found.push({ key, name: w.name || key, icon: w.icon || '' });
        }
      } catch (e) {}
    }
    // Include any others (avoid duplicates)
    for (const key of Object.keys(c)) {
      try {
        const w = c[key];
        if (w && typeof w.enable === 'function' && !found.some(f => f.key === key)) {
          found.push({ key, name: w.name || key, icon: w.icon || '' });
        }
      } catch (e) {}
    }
    return found;
  }

  let state = {
    connected: false,
    key: null,
    name: null,
    addrHex: null,
    networkId: null,
    api: null,
  };

  function shortHex(h) {
    if (!h) return '';
    const s = String(h).replace(/^0x/i, '');
    if (s.length <= 16) return s;
    return s.slice(0, 10) + '…' + s.slice(-8);
  }

  function showStatus(msg, isError = false) {
    try {
      const el = document.getElementById('wallet-link-status');
      if (el) {
        el.textContent = msg || '';
        el.style.color = isError ? '#ef476f' : '#b8c19a';
      }
    } catch (e) {}
  }

  function persistState() {
    try {
      if (state.connected) {
        const payload = {
          key: state.key,
          name: state.name,
          addrHex: state.addrHex,
          networkId: state.networkId,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
  }

  function setState(partial, persist = true) {
    state = { ...state, ...partial };
    if (persist) persistState();
    renderUI();
  }

  async function connect(preferredKey) {
    try {
      const wallets = detectWallets();
      let target = null;
      if (preferredKey) {
        target = wallets.find(w => w.key === preferredKey) || null;
      }
      if (!target) {
        target =
          wallets.find(w => PREFERRED_ORDER.includes(w.key)) ||
          wallets[0] ||
          null;
      }
      if (!target) {
        throw new Error('No Cardano wallet extension detected.');
      }

      const api = await window.cardano[target.key].enable();
      const networkId = await api.getNetworkId();

      let used = [];
      try {
        used = await api.getUsedAddresses();
      } catch (e) {}
      let change = null;
      try {
        change = await api.getChangeAddress();
      } catch (e) {}

      const addrHex = (used && used[0]) || change || null;

      setState(
        {
          connected: true,
          key: target.key,
          name: target.name,
          api,
          networkId,
          addrHex,
        },
        true
      );
      return true;
    } catch (err) {
      console.warn('Wallet connect failed:', err);
      setState(
        {
          connected: false,
          key: null,
          name: null,
          api: null,
          networkId: null,
          addrHex: null,
        },
        true
      );
      showStatus(
        'Failed to connect: ' + (err && err.message ? err.message : String(err)),
        true
      );
      return false;
    }
  }

  function disconnect() {
    setState(
      {
        connected: false,
        key: null,
        name: null,
        api: null,
        networkId: null,
        addrHex: null,
      },
      true
    );
  }

  function renderUI() {
    try {
      const linkBtn = document.getElementById('wallet-link-btn');
      const discBtn = document.getElementById('wallet-disconnect-btn');
      const walletSpan = document.getElementById('profile-wallet');
      const statusRow = document.getElementById('profile-status');

      if (state.connected) {
        if (linkBtn) {
          linkBtn.textContent = 'Wallet Linked (' + (state.name || state.key) + ')';
          linkBtn.disabled = true;
        }
        if (discBtn) {
          discBtn.style.display = 'inline-block';
          discBtn.disabled = false;
        }
        if (walletSpan) {
          walletSpan.textContent =
            (state.name || state.key) + ' ' + shortHex(state.addrHex);
        }
        if (statusRow) {
          statusRow.textContent =
            'Wallet: ' +
            (state.name || state.key) +
            (state.networkId === 1
              ? ' (Mainnet)'
              : state.networkId === 0
              ? ' (Testnet/Preprod)'
              : '');
        }
        showStatus(
          'Connected to ' +
            (state.name || state.key) +
            (state.networkId === 1
              ? ' (Mainnet)'
              : state.networkId === 0
              ? ' (Testnet/Preprod)'
              : '')
        );
      } else {
        if (linkBtn) {
          linkBtn.textContent = 'Link Wallet';
          linkBtn.disabled = false;
        }
        if (discBtn) {
          discBtn.style.display = 'none';
        }
        if (walletSpan) {
          walletSpan.textContent = 'Not linked';
        }
        if (statusRow) {
          // don't overwrite other statuses if any; keep empty by default
          if (!statusRow.textContent) statusRow.textContent = '';
        }
        showStatus('');
      }
    } catch (e) {}
  }

  // Wallet chooser UI
  function getWalletActionsRoot() {
    try {
      return document.querySelector('.wallet-actions') || null;
    } catch (e) {
      return null;
    }
  }

  function ensureChooserEl(root) {
    if (!root) return null;
    let el = document.getElementById('wallet-chooser');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wallet-chooser';
      el.style.display = 'none';
      el.style.flexWrap = 'wrap';
      el.style.gap = '8px';
      el.style.marginTop = '6px';
      el.style.width = '100%';
      root.appendChild(el);
    }
    return el;
  }

  function hideWalletChooser() {
    const el = document.getElementById('wallet-chooser');
    if (el) el.style.display = 'none';
  }

  function showWalletChooser(wallets) {
    const root = getWalletActionsRoot();
    const linkBtn = document.getElementById('wallet-link-btn');
    if (!root || !Array.isArray(wallets) || wallets.length === 0) return;
    const el = ensureChooserEl(root);
    if (!el) return;

    el.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'muted';
    title.textContent = 'Select a Cardano wallet:';
    title.style.width = '100%';
    el.appendChild(title);

    wallets.forEach((w) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '8px';
      btn.style.pointerEvents = 'auto';
      btn.style.padding = '8px 12px';
      btn.style.fontWeight = '700';
      btn.style.borderRadius = '8px';
      btn.style.border = '1px solid rgba(120,200,255,0.25)';
      btn.style.background = 'linear-gradient(135deg, rgba(24,28,36,0.95), rgba(12,14,18,0.9))';
      btn.style.color = '#e6f1ff';
      btn.style.cursor = 'pointer';

      if (w.icon) {
        const img = document.createElement('img');
        img.src = w.icon;
        img.alt = w.name || w.key;
        img.width = 18;
        img.height = 18;
        img.style.borderRadius = '4px';
        btn.appendChild(img);
      }
      const label = document.createElement('span');
      label.textContent = w.name || w.key;
      btn.appendChild(label);

      btn.addEventListener('click', async () => {
        try {
          hideWalletChooser();
          if (linkBtn) linkBtn.disabled = true;
          showStatus('Connecting to ' + (w.name || w.key) + '...');
          await connect(w.key);
        } finally {
          if (linkBtn) linkBtn.disabled = false;
        }
      });

      el.appendChild(btn);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost';
    cancel.textContent = 'Cancel';
    cancel.style.pointerEvents = 'auto';
    cancel.style.padding = '8px 12px';
    cancel.style.fontWeight = '700';
    cancel.style.borderRadius = '8px';
    cancel.style.border = '1px solid rgba(120,200,255,0.25)';
    cancel.style.background = 'linear-gradient(135deg, rgba(24,28,36,0.95), rgba(12,14,18,0.9))';
    cancel.style.color = '#e6f1ff';
    cancel.style.cursor = 'pointer';
    cancel.addEventListener('click', () => {
      hideWalletChooser();
      showStatus('');
    });
    el.appendChild(cancel);

    el.style.display = 'flex';
  }

  function wireUI() {
    try {
      const linkBtn = document.getElementById('wallet-link-btn');
      const discBtn = document.getElementById('wallet-disconnect-btn');

      if (linkBtn) {
        linkBtn.addEventListener('click', async () => {
          if (state.connected) return;
          const wallets = detectWallets();
          if (wallets.length === 0) {
            showStatus(
              'No Cardano wallet detected. Install Nami, Eternl, Lace, Flint, etc.',
              true
            );
            try {
              alert(
                'No Cardano wallet detected.\nPlease install a CIP-30 compatible wallet (e.g., Nami, Eternl, Lace, Flint) and try again.'
              );
            } catch (e) {}
            return;
          }

          // If multiple wallets are available, show chooser; otherwise connect directly
          if (wallets.length > 1) {
            showWalletChooser(wallets);
            return;
          }

          linkBtn.disabled = true;
          showStatus('Connecting to ' + (wallets[0].name || wallets[0].key) + '...');
          await connect(wallets[0].key);
          linkBtn.disabled = false;
        });
      }

      if (discBtn) {
        discBtn.addEventListener('click', () => {
          disconnect();
        });
      }
    } catch (e) {}
    renderUI();
  }

  function autoReconnect() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.key) return;
      const wallets = detectWallets();
      if (!wallets.some(w => w.key === saved.key)) return;
      connect(saved.key).then(() => {}).catch(() => {});
    } catch (e) {}
  }

  // Public API
  window.JunkoraWallet = {
    detect: detectWallets,
    connect,
    disconnect,
    get state() {
      const { api, ...rest } = state;
      return rest;
    },
    getAddressHex() {
      return state.addrHex;
    },
    getWalletName() {
      return state.name || state.key;
    },
    get blockfrost() {
      return { key: BLOCKFROST_API_KEY, url: BLOCKFROST_API_URL };
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireUI();
      autoReconnect();
    });
  } else {
    wireUI();
    autoReconnect();
  }
})();
