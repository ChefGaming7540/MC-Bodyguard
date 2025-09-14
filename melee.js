// === Weapon Preference List ===
const weaponList = [
  'netherite_sword',
  'netherite_axe',
  'diamond_sword',
  'diamond_axe',
  'iron_sword',
  'iron_axe',
  'wooden_sword',
  'wooden_axe',
  'golden_sword',
  'golden_axe',
];

async function equipBestWeapon(bot) {
  for (const itemName of weaponList) {
    const item = bot.registry.itemsByName[itemName];
    if (!item) continue;

    const hasItem = bot.inventory.count(item.id) > 0;
    if (hasItem) {
      try {
        await bot.equip(item.id, 'hand');
      } catch (err) {
        bot.chat(`⚠️ Failed to equip ${itemName}: ${err.message}`);
      }
      break;
    }
  }
}

async function punch(bot, target) {
  if (!target) return;
  try {
    await bot.attack(target);
  } catch (err) {
    bot.chat(`⚠️ Punch failed: ${err.message}`);
  }
}

async function crit(bot, target) {
  if (!target) return;
  try {
    await bot.setControlState('jump', true);
    await bot.waitForTicks(10);
    await bot.attack(target);
  } catch (err) {
    bot.chat(`⚠️ Crit failed: ${err.message}`);
  } finally {
    bot.setControlState('jump', false);
  }
}

module.exports = (bot) => {
  // --- Attack system state ---
  let currentTarget = null;
  let lastAttackTime = 0;
  const ATTACK_COOLDOWN = 500; // ms

  // === Attach Melee Functions ===
  bot.melee = {
    async equip() {
      await equipBestWeapon(bot);
    },
    async punch(target) {
      await punch(bot, target);
    },
    async crit(target) {
      await crit(bot, target);
    },
  };

  // === Command API ===
  bot.commands.crit = async (targetName, { log }) => {
    const target = bot.getEntity(targetName);
    if (target) {
      await bot.melee.crit(target);
    } else {
      log(`Couldn't find ${targetName}.`);
    }
  };

  bot.commands.equip = bot.melee.equip;

  bot.commands.punch = async (targetName, { log }) => {
    const target = bot.getEntity(targetName);
    if (target) {
      await bot.melee.punch(target);
    } else {
      log(`Couldn't find ${targetName}.`);
    }
  };

  // === Helper: Pick Closest Valid Target ===
  function pickTarget() {
    const threats = Object.values(bot.entities).filter(
      (e) =>
        e.type === 'mob' &&
        e.isValid &&
        e.health > 0 &&
        e.position.distanceTo(bot.entity.position) < 16
    );
    if (threats.length === 0) return null;

    threats.sort(
      (a, b) =>
        a.position.distanceTo(bot.entity.position) -
        b.position.distanceTo(bot.entity.position)
    );
    return threats[0];
  }

  // === Attack Loop (runs every tick) ===
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

    try {
      await bot.melee.equip();

      // Attack directly
      await bot.attack(liveEntity);
    } catch (err) {
      bot.chat(`⚠️ Attack failed: ${err.message}`);
      currentTarget = null;
    }
  }

  // === Main Loop ===
  async function mainLoop() {
    if (!currentTarget) {
      currentTarget = pickTarget();
    }

    if (currentTarget) {
      await attackLoop();
    }
  }

  // === Live Entity Cleanup ===
  bot.on('entityGone', (entity) => {
    if (currentTarget && entity.id === currentTarget.id) {
      currentTarget = null;
    }
  });

  // === Loop Runner ===
  ;(async () => {
    while (true) {
      await bot.waitForTicks(1);
      await mainLoop();
    }
  })();
};
