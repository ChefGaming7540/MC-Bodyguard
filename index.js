/**
 * index.js - Bot Manager
 * Spawns & manages Mineflayer bots as child processes.
 * Provides CLI commands for spawning, messaging, and controlling bots.
 */

const { fork } = require('child_process');
const readline = require('readline');

// === CONFIGURATION ===
const CONFIG = {
  host: 'ChefsKitchen.aternos.me',
  port: 61563,
  defaultBotCount: 1,  // Auto-spawn count on startup
  spawnDelay: 5000,    // Delay between spawns (ms)
  autoRespawn: true,   // Recreate bot if it exits
  defaultName: 'NamelessKnight'
};

// === STATE ===
const bots = new Map(); // Map<botName, childProcess>

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// === HELPERS ===
const sleep = ms => new Promise(r => setTimeout(r, ms));

function logInfo(msg) {
  console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);
}
function logWarn(msg) {
  console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`);
}
function logError(msg) {
  console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
}

// === BOT MANAGEMENT ===
function spawnBot(botName) {
  if (bots.has(botName)) {
    logWarn(`Bot "${botName}" already exists.`);
    return;
  }

  const bot = fork('bot.js', [botName, CONFIG.host, CONFIG.port]);
  bots.set(botName, bot);

  logInfo(`Spawned bot: ${botName}`);

  bot.on('message', (data) => {
    if (data.type === 'message') {
      console.log(`\x1b[32m@${botName}\x1b[0m: ${data.text}`);
    }
  });

  bot.on('exit', (code, signal) => {
    bots.delete(botName);
    logWarn(`Bot "${botName}" exited (code=${code}, signal=${signal})`);
    if (CONFIG.autoRespawn) {
      logInfo(`Respawning ${botName} in ${CONFIG.spawnDelay / 1000}s...`);
      setTimeout(() => spawnBot(botName), CONFIG.spawnDelay);
    }
  });
}

async function spawnBots(count = 1) {
  for (let i = 0; i < count; i++) {
    const botName = CONFIG.defaultName + (count > 1 ? `_${i + 1}` : '');
    spawnBot(botName);
    await sleep(CONFIG.spawnDelay);
  }
}

function stopBot(botName) {
  const bot = bots.get(botName);
  if (!bot) return logWarn(`No bot found with name "${botName}"`);
  bot.kill();
  bots.delete(botName);
  logInfo(`Stopped bot: ${botName}`);
}

function stopAllBots() {
  bots.forEach((bot, name) => stopBot(name));
  logInfo('All bots stopped.');
}

// === COMMAND HANDLER ===
const COMMANDS = {
  ping() {
    console.log('pong');
  },
  spawn(...args) {
    if (args.length === 1 && !isNaN(args[0])) {
      spawnBots(Number(args[0]));
    } else if (args.length > 0) {
      for (const name of args) spawnBot(name);
    } else {
      spawnBots(1);
    }
  },
  stop(...args) {
    if (args.length === 0) stopAllBots();
    else for (const name of args) stopBot(name);
  },
  list() {
    console.log('Active bots:', [...bots.keys()].join(', ') || '(none)');
  },
  help() {
    console.log(`Available commands:
    spawn [n|name1 name2 ...] - Spawn bots
    stop [name]              - Stop specific bot or all if none given
    list                     - List active bots
    @botName <command>       - Send command to bot
    ping                     - Test manager responsiveness
    help                     - Show this message`);
  }
};

function runCommand(input) {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length === 0 || !tokens[0]) return;

  // Bot-specific command: @botName <rest>
  if (tokens[0].startsWith('@')) {
    const botName = tokens[0].slice(1);
    const bot = bots.get(botName);
    if (!bot) return logWarn(`No bot named "${botName}".`);
    bot.send({ type: 'command', command: tokens.slice(1) });
    return;
  }

  const cmd = tokens[0].toLowerCase();
  const fn = COMMANDS[cmd];
  if (fn) fn(...tokens.slice(1));
  else logError(`Unknown command: ${cmd}`);
}

// === MAIN LOOP ===
function inputLoop() {
  rl.question('> ', (input) => {
    runCommand(input);
    inputLoop();
  });
}

async function main() {
  if (CONFIG.defaultBotCount > 0) {
    await spawnBots(CONFIG.defaultBotCount);
  }
  inputLoop();
}

main();