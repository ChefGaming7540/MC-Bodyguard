/**
 * bot.js - Mineflayer Guard Bot
 * Features:
 *  - Guard a specified player, follow them, attack threats
 *  - Auto-equip best weapon and armor
 *  - Use melee or archery depending on situation
 *  - Auto-eat when hunger drops
 *  - Command system via parent process, chat, or whisper
 */

const mineflayer = require('mineflayer');
const fs = require('fs');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

// === PLUGINS ===
const attachMelee = require('./melee.js');
const archeryPlugin = require('./archery.js');
const armorPlugin = require('./armor.js');

// === CONFIG ===
if (process.argv.length < 5) process.exit();
const [botName, hostName, hostPort] = process.argv.slice(2);

const HUNGER_LIMIT = 15;
const LINE_BREAKS = /\r?\n/g;
const bossList = fs.readFileSync('boss-list.txt', 'utf8').split(LINE_BREAKS).filter(Boolean);
const targetList = fs.readFileSync('target-list.txt', 'utf8').split(LINE_BREAKS).filter(Boolean);

// === BOT CREATION ===
const bot = mineflayer.createBot({
  username: botName,
  host: hostName,
  port: parseInt(hostPort),
  viewDistance: 'tiny',
});

bot.on('kicked', console.log);
bot.on('error', console.log);

// === PLUGIN LOADING ===
bot.loadPlugin(pathfinder);
attachMelee(bot, { debug: false, range: 10 });
bot.loadPlugin(archeryPlugin);
bot.loadPlugin(armorPlugin);

// === STATE ===
let guardedPlayer = null;
let guarding = true;
let isEating = false;
let defaultMove;

// === HELPERS ===
bot.getEntity = (name) => bot.nearestEntity(
  (e) => e.displayName === name || e.username === name
);

function sendMessage(text) {
  process.send?.({ type: 'message', text });
}

function findThreat() {
  return bot.nearestEntity((entity) => {
    if (entity.kind !== 'Hostile mobs' && !targetList.includes(entity.username)) return false;
    const distBot = entity.position.distanceTo(bot.entity.position);
    if (distBot < 8) return true;
    if (!guardedPlayer || !guardedPlayer.entity) return false;
    const distPlayer = entity.position.distanceTo(guardedPlayer.entity.position);
    return distPlayer < 16;
  });
}

function findAttacker(position = bot.entity.position) {
  return bot.nearestEntity((e) =>
    !bossList.includes(e.username) && e.position.distanceTo(position) < 5
  );
}

async function eatFood(log = sendMessage) {
  if (isEating || bot.food === 20) return log(isEating ? 'already eating' : 'too full to eat');
  isEating = true;
  try {
    for (const food of bot.registry.foodsArray) {
      const count = bot.inventory.count(food.id);
      if (count === 0) continue;
      log(`found ${count} ${food.displayName}`);
      await bot.equip(food.id);
      await bot.consume();
      log(`ate 1 ${food.displayName}`);
      break;
    }
  } catch (err) {
    log(`🍽️ Eating error: ${err.message}`);
  } finally {
    isEating = false;
  }
}

// === ATTACK LOGIC ===
async function attackEnemy(enemy) {
  if (!enemy?.isValid || enemy.health <= 0) return;

  const followGoal = new goals.GoalFollow(enemy, 4);
  try {
    await bot.pathfinder.goto(followGoal);
  } catch (err) {
    sendMessage(`Could not path to enemy: ${err.message}`);
    return;
  }
  if (!enemy?.isValid) return;

  if (bot.archery?.canShoot() && Math.random() > 0.3) {
    await bot.archery.shoot(enemy);
  } else {
    await bot.melee.equip();
    await bot.melee.punch(enemy);
  }
}

// === MAIN LOOP ===
async function guardLoop() {
  while (true) {
    await bot.waitForTicks(1);
    if (!guarding) continue;

    const enemy = findThreat();
    if (enemy) {
      await attackEnemy(enemy);
      continue;
    }

    if (guardedPlayer?.entity) {
      try {
        await bot.pathfinder.goto(new goals.GoalFollow(guardedPlayer.entity, 4));
      } catch (err) {
        sendMessage(`Failed to path to guarded player: ${err.message}`);
      }
    }
  }
}

// === COMMANDS ===
bot.commands = {
  continue: async () => { guarding = true; },
  eat: async ({ log }) => { await eatFood(log); },
  guard: async (username, { log }) => {
    const player = bot.players[username];
    if (!player) return log(`Player "${username}" not found.`);
    guardedPlayer = player;
  },
  ping: async ({ log }) => { log('pong'); },
  status: async ({ log }) => { log(`HEALTH: ${bot.health} HUNGER: ${bot.food}`); },
  stop: async ({ log }) => {
    log('Stopping guard mode.');
    guarding = false;
    bot.pathfinder.setGoal(null);
  }
};

async function runCommand(tokens, user, log) {
  const fn = bot.commands[tokens[0]];
  if (!fn) return log('Unknown command.');
  await fn(...tokens.slice(1), { user, log });
}

// === EVENTS ===
process.on('message', (data) => {
  if (data.type === 'command') {
    runCommand(data.command, 'admin', sendMessage);
  }
});

bot.once('spawn', async () => {
  sendMessage('Bot spawned.');
  const mcData = require('minecraft-data')(bot.version);
  defaultMove = new Movements(bot, mcData);
  defaultMove.canDig = false;
  bot.pathfinder.setMovements(defaultMove);

  // make doors walkable
  ['oak_door','spruce_door','birch_door','acacia_door','dark_oak_door','iron_door']
    .forEach((door) => {
      const block = mcData.blocksByName[door];
      if (block) defaultMove.walkableBlocks?.add(block.id);
    });

  guardLoop(); // Start main loop
});

bot.on('chat', async (username, message) => {
  if (!bossList.includes(username)) return;
  const tokens = message.split(' ');
  await runCommand(tokens, username, bot.chat);
});

bot.on('whisper', async (username, message) => {
  if (!bossList.includes(username)) return;
  const tokens = message.split(' ');
  await runCommand(tokens, username, (text) => bot.whisper(username, text));
});

bot.on('health', async () => {
  if (bot.food <= HUNGER_LIMIT) {
    sendMessage(`Hunger low: ${bot.food}`);
    await eatFood();
  }
});

bot.on('entityHurt', (entity) => {
  let attacked = entity === bot.entity || (guardedPlayer?.entity && entity === guardedPlayer.entity);
  if (attacked) {
    sendMessage(`${entity.username ?? 'entity'} was hurt!`);
    const attacker = findAttacker();
    if (attacker && !targetList.includes(attacker.username)) {
      targetList.push(attacker.username);
    }
  }
});

bot.on('entityGone', (entity) => {
  const idx = targetList.indexOf(entity.username);
  if (idx !== -1) targetList.splice(idx, 1);
});

bot.on('respawn', async () => {
  sendMessage('Respawned.');
  if (guardedPlayer?.username) {
    bot.chat(`/tp ${bot.username} ${guardedPlayer.username}`);
  }
});