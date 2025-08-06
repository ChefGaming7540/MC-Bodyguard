const mineflayer = require('mineflayer');
const fs = require('fs');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const meleePlugin = require('./melee.js');
const archeryPlugin = require('./archery.js');
const armorPlugin = require('./armor.js');

if (process.argv.length < 5) process.exit();

const [botName, hostName, hostPort] = process.argv.slice(2);

const LINE_BREAKS = /\r?\n/g;
const HUNGER_LIMIT = 15;

const bossList = fs.readFileSync("boss-list.txt", "utf8").split(LINE_BREAKS).filter(Boolean);
const targetList = fs.readFileSync("target-list.txt", "utf8").split(LINE_BREAKS).filter(Boolean);

let defaultMove;
let guardedPlayer;
let guarding = true;
let isEating = false;
let lastAttackTime = 0;
const ATTACK_COOLDOWN = 500;

const bot = mineflayer.createBot({
	username: botName,
	host: hostName,
	port: parseInt(hostPort),
	viewDistance: "tiny",
});

bot.on('kicked', console.log);
bot.on('error', console.log);

bot.loadPlugin(pathfinder);
bot.loadPlugin(meleePlugin);
bot.loadPlugin(archeryPlugin);
bot.loadPlugin(armorPlugin);

bot.getEntity = (name) => {
	return bot.nearestEntity((entity) => {
		return entity.displayName === name || entity.username === name;
	});
};

function findThreat() {
	return bot.nearestEntity((entity) => {
		if (entity.kind !== "Hostile mobs" && !targetList.includes(entity.username)) return false;
		const distanceFromBot = entity.position.distanceTo(bot.entity.position);
		if (distanceFromBot < 8) return true;
		if (!guardedPlayer || !guardedPlayer.entity) return false;
		const distanceFromPlayer = entity.position.distanceTo(guardedPlayer.entity.position);
		return distanceFromPlayer < 16;
	});
}

function findAttacker(position = bot.entity.position) {
	return bot.nearestEntity((entity) => {
		if (bossList.includes(entity.username)) return false;
		return entity.position.distanceTo(position) < 5;
	});
}

async function attackEnemy(enemy) {
	if (!enemy || !enemy.isValid || !enemy.position || enemy.health <= 0) return;

	const now = Date.now();
	if (now - lastAttackTime < ATTACK_COOLDOWN) return;
	lastAttackTime = now;

	const pos = bot.entity.position;
	const enemyGoal = new goals.GoalNear(pos.x, pos.y, pos.z, 4);
	const pathToBot = bot.pathfinder.getPathFromTo(defaultMove, enemy.position, enemyGoal);
	let path = pathToBot.next().value.result;
	while (path.status === 'partial') {
		path = pathToBot.next().value.result;
	}
	const timeToArrival = path.cost;
	const timeToDrawBow = 4;

	if (bot.archery.canShoot() && timeToArrival > timeToDrawBow) {
		await bot.archery.shoot(enemy);
	} else {
		let goal = new goals.GoalFollow(enemy, 4);
		try {
			await bot.pathfinder.goto(goal);
		} catch (err) {
			sendMessage(`Could not path to enemy: ${err.message}`);
			return;
		}
		if (!enemy || !enemy.isValid || !enemy.position || enemy.health <= 0) return;
		await bot.melee.equip();
		await bot.melee.punch(enemy);
	}
}

async function loop() {
	if (!guarding) return;
	const enemy = findThreat();
	if (enemy) {
		await attackEnemy(enemy);
		return;
	}
	if (guardedPlayer && guardedPlayer.entity) {
		try {
			await bot.pathfinder.goto(new goals.GoalFollow(guardedPlayer.entity, 4));
		} catch (err) {
			sendMessage(`Failed to path to guarded player: ${err.message}`);
		}
	}
}

async function eatFood(log = sendMessage) {
	if (isEating || bot.food === 20) {
		log(isEating ? "already eating" : "too full to eat");
		return;
	}
	isEating = true;
	try {
		for (const food of bot.registry.foodsArray) {
			const amount = bot.inventory.count(food.id);
			if (amount === 0) continue;
			log(`found ${amount} ${food.displayName}`);
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

bot.commands = {
	"continue": async () => { guarding = true; },
	"eat": async ({ log }) => { await eatFood(log); },
	"guard": async (username, { log }) => {
		const player = bot.players[username];
		if (!player) { log(`Player "${username}" does not exist.`); return; }
		guardedPlayer = player;
	},
	"ping": async ({ log }) => { log("pong"); },
	"status": async ({ log }) => { log(`❤${bot.health} 🥕${bot.food}`); },
	"stop": async ({ log }) => {
		log("Stopping.");
		bot.pathfinder.setGoal(null);
		guarding = false;
	},
};

async function runCommand(tokens, user, log) {
	const commandFunction = bot.commands[tokens[0]];
	if (!commandFunction) { log("Unknown command."); return; }
	await commandFunction(...tokens.slice(1), { user, log });
}

function sendMessage(text) {
	process.send?.({ type: "message", text });
}

process.on('message', (data) => {
	if (data.type === "command") {
		runCommand(data.command, user = "admin", log = sendMessage);
		return;
	}
	console.log(`${botName} received unknown message: `, data);
});

bot.once("spawn", async () => {
	sendMessage("🛡️ Bot has spawned. Teleporting to guarded player...");

	const mcData = require('minecraft-data')(bot.version);
	defaultMove = new Movements(bot, mcData);
	defaultMove.canDig = false;

	// 🛠️ Ensure walkable and cantBreak sets exist
	if (!defaultMove.walkableBlocks) defaultMove.walkableBlocks = new Set();
	if (!defaultMove.blocksCantBreak) defaultMove.blocksCantBreak = new Set();

	// ✅ Make doors walkable
	[
		'oak_door', 'spruce_door', 'birch_door', 'jungle_door',
		'acacia_door', 'dark_oak_door', 'iron_door',
		'mangrove_door', 'cherry_door', 'bamboo_door',
		'crimson_door', 'warped_door'
	].forEach(door => {
		const block = mcData.blocksByName[door];
		if (!block) return;
		defaultMove.walkableBlocks.add(block.id);
		defaultMove.blocksCantBreak.add(block.id);
	});

	bot.pathfinder.setMovements(defaultMove);

	// Disable all digging
	bot.dig = async () => {};
	bot.digBlock = async () => {};
	bot.canDigBlock = () => false;

	await bot.waitForTicks(5);
	if (guardedPlayer && guardedPlayer.username) {
		bot.chat(`/tp ${bot.username} ${guardedPlayer.username}`);
	}

	// Initial boss-scan loop
	while (true) {
		let foundBoss = bot.nearestEntity((entity) => bossList.includes(entity.username));
		if (foundBoss) {
			guardedPlayer = bot.players[foundBoss.username];
			break;
		}
		const enemy = findThreat();
		if (enemy) await attackEnemy(enemy);
		await bot.waitForTicks(5);
	}

	// Begin main loop
	while (true) {
		await bot.waitForTicks(1);
		await loop();
	}
});

bot.on("chat", async (username, message) => {
	if (!bossList.includes(username)) return;
	const tokens = message.split(' ');
	await runCommand(tokens, user = username, log = bot.chat);
});

bot.on("whisper", async (username, message) => {
	if (!bossList.includes(username)) return;
	const tokens = message.split(' ');
	await runCommand(tokens, user = username, log = (text) => bot.whisper(username, text));
});

bot.on("health", async () => {
	if (bot.food > HUNGER_LIMIT) return;
	sendMessage(`hunger has reached ${bot.food}!`);
	await eatFood();
});

bot.on("entityGone", (entity) => {
	const targetIndex = targetList.indexOf(entity.username);
	if (targetIndex === -1) return;
	targetList.splice(targetIndex, 1);
});

bot.on("entityHurt", (entity) => {
	let attacked = false;
	if (entity === bot.entity) attacked = true;
	if (guardedPlayer && guardedPlayer.entity && entity === guardedPlayer.entity) attacked = true;
	if (attacked) {
		sendMessage(`${entity.username} was hurt!`);
		const attacker = findAttacker(bot.entity.position);
		if (attacker && !targetList.includes(attacker.username)) {
			targetList.push(attacker.username);
		}
	}
});

bot.on("spawn", async () => {
	sendMessage("🌀 Respawned. Waiting for teleport...");
	await bot.waitForTicks(5);
	if (guardedPlayer && guardedPlayer.username) {
		bot.chat(`/tp ${bot.username} ${guardedPlayer.username}`);
	}
});
