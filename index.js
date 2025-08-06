const { fork } = require('child_process');
const readline = require("readline");

const hostName = "ChefsKitchen.aternos.me";
const hostPort = 61563;

const bots = [];
const botsByName = {};

const autoSpawnBots = 1;
const spawnDelay = 5000;

const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function sleep(time) {
    return new Promise(resolve=>setTimeout(resolve, time));
}

function spawnBot(botName) {
	const bot = fork("bot.js", [botName, hostName, hostPort]);

	bots.push(bot);
	botsByName[botName] = bot;

	bot.on('message', (data) => {
		if (data.type === "message") {
			console.log(`\x1b[32m@${botName}\x1b[0m: ${data.text}`);
		}
	});
}

async function spawnBots(amount=1) {
	for (let i = 0; i < amount; i++) {
		spawnBot(`NamelessKnight`);

		await sleep(spawnDelay);
	}
}

const COMMAND_FUNCTIONS = {
	"ping": ()=>{
		console.log("pong");
	},

	"spawn": (...args) => {
	if (args.length === 1 && !isNaN(args[0])) {
		// e.g., spawn 3
		spawnBots(Number(args[0]));
	} else {
		// e.g., spawn bot1 bot2 bot3
		for (const customName of args) {
			if (botsByName[customName]) {
				console.log(`Bot "${customName}" already exists.`);
				continue;
			}
			spawnBot(customName);
		}
	}
},
};

function runCommand(command) {
	const tokens = command.split(' ');

	if (tokens[0].startsWith('@')) {
		const botName = tokens[0].slice(1);
		const bot = botsByName[botName];

		if (!bot) {
			console.log(`Couldn't find bot named "${botName}".`);
			return;
		}

		bot.send({
			type: "command",
			command: tokens.slice(1),
		});

		return;
	}

	const commandFunction = COMMAND_FUNCTIONS[tokens[0]];

	if (!commandFunction) {
		console.log(`Unknown command: ${tokens[0]}`);
		return;
	}

	commandFunction(...tokens.slice(1));
}

function inputLoop(command) {
    if (command) runCommand(command);
    reader.question(">", inputLoop);
}

async function main() {
	spawnBots(autoSpawnBots);
	inputLoop();
}

main();
