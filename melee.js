// === melee.js (Rewritten & Optimized) ===
// Simple auto-melee system with weapon priority, toggleable targeting, and clean API

const weaponList = [
  'netherite_sword',
  'netherite_axe',
  'diamond_sword',
  'diamond_axe',
  'iron_sword',
  'iron_axe',
  'stone_sword',
  'stone_axe',
  'wooden_sword',
  'wooden_axe',
  'golden_sword',
  'golden_axe',
];

module.exports = function attachMelee(bot, options = {}) {
  const debug = !!options.debug;
  let currentTarget = null;
  let lastAttackTime = 0;
  let running = false;

  const ATTACK_COOLDOWN = options.cooldown || 500; // ms
  const TARGET_RANGE = options.range || 16;

  // --- Cached best weapon (recalculated on inventory update) ---
  let bestWeapon = null;

  function logDebug(msg) {
    if (debug) bot.chat(`[Melee Debug] ${msg}`);
  }

  function findBestWeapon() {
    for (const name of weaponList) {
      const item = bot.inventory.items().find((i) => i.name === name);
      if (item) return item;
    }
    return null;
  }

  async function equipBestWeapon() {
    if (!bestWeapon) bestWeapon = findBestWeapon();
    if (!bestWeapon) return; // No weapon available
    try {
      await bot.equip(bestWeapon, 'hand');
      logDebug(`Equipped ${bestWeapon.name}`);
    } catch (err) {
      logDebug(`Failed to equip weapon: ${err.message}`);
    }
  }

  function pickTarget() {
    const threats = Object.values(bot.entities).filter(
      (e) =>
        e.type === 'mob' &&
        e.isValid &&
        e.health > 0 &&
        e.position.distanceTo(bot.entity.position) <= TARGET_RANGE
    );
    if (threats.length === 0) return null;
    threats.sort(
      (a, b) =>
        a.position.distanceTo(bot.entity.position) -
        b.position.distanceTo(bot.entity.position)
    );
    return threats[0];
  }

  async function attackLoop() {
    if (!currentTarget) return;
    const liveEntity = bot.entities[currentTarget.id];
    if (!liveEntity || !liveEntity.isValid || liveEntity.health <= 0) {
      currentTarget = null;
      return;
    }

    const now = Date.now();
    if (now - lastAttackTime < ATTACK_COOLDOWN) return;
    lastAttackTime = now;

    await equipBestWeapon();
    try {
      await bot.attack(liveEntity);
      logDebug(`Attacked ${liveEntity.name ?? 'entity'} (${liveEntity.id})`);
    } catch (err) {
      logDebug(`Attack failed: ${err.message}`);
      currentTarget = null;
    }
  }

  async function mainLoop() {
    while (running) {
      await bot.waitForTicks(1);
      if (!currentTarget) currentTarget = pickTarget();
      if (currentTarget) await attackLoop();
    }
  }

  // === API ===
  bot.melee = {
    start() {
      if (running) return;
      running = true;
      mainLoop();
      logDebug('Melee loop started');
    },
    stop() {
      running = false;
      currentTarget = null;
      logDebug('Melee loop stopped');
    },
    async punch(target) {
      if (!target) return;
      await equipBestWeapon();
      await bot.attack(target);
    },
    async crit(target) {
      if (!target) return;
      await equipBestWeapon();
      try {
        bot.setControlState('jump', true);
        await bot.waitForTicks(10);
        await bot.attack(target);
      } finally {
        bot.setControlState('jump', false);
      }
    },
    async equip() {
      await equipBestWeapon();
    },
  };

  // === Keep best weapon cached ===
  bot.on('inventoryUpdate', () => {
    bestWeapon = findBestWeapon();
  });

  // === Auto-stop if bot dies ===
  bot.on('death', () => {
    currentTarget = null;
    running = false;
  });

  logDebug('Melee system loaded.');
};