const hawkeye = require('minecrafthawkeye');

async function equipBow(bot) {
    const bowItem = bot.inventory.items().find(i => i.name === 'bow');
    if (!bowItem) return false;

    try {
        await bot.equip(bowItem, 'hand');
        return true;
    } catch (err) {
        bot.emit("customLog", `⚠ Failed to equip bow: ${err.message}`);
        return false;
    }
}

function hasArrows(bot) {
    const arrowItem = bot.registry.itemsByName['arrow'];
    return bot.inventory.count(arrowItem.id) > 0;
}

function hasBow(bot) {
    const bowItem = bot.registry.itemsByName['bow'];
    return bot.inventory.count(bowItem.id) > 0;
}

async function shoot(bot, target) {
    if (!target || !target.isValid) return;
    if (!bot.archery.canShoot()) return;

    const equipped = await equipBow(bot);
    if (!equipped) return;

    try {
        await bot.hawkEye.oneShot(target, "bow");
        bot.emit("customLog", `🏹 Shot fired at ${target.displayName ?? target.username ?? "target"}`);
    } catch (err) {
        bot.emit("customLog", `⚠ Failed to shoot: ${err.message}`);
    }
}

module.exports = (bot) => {
    bot.loadPlugin(hawkeye.default);
    bot.archery = {};

    bot.archery.canShoot = () => {
        return hasArrows(bot) && hasBow(bot);
    };

    bot.archery.hasArrows = () => hasArrows(bot);
    bot.archery.hasBow = () => hasBow(bot);

    bot.archery.shoot = async (target) => {
        // fire-and-forget so combat loop doesn't block
        shoot(bot, target);
    };

    bot.commands.shoot = async (targetName, { log }) => {
        const target = bot.getEntity(targetName);
        if (target) {
            await shoot(bot, target);
        } else {
            log(`Couldn't find ${targetName}.`);
        }
    };
};