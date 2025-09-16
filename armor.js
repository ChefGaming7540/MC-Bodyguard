// armor.js - Improved
const helmets = ["netherite_helmet", "diamond_helmet", "iron_helmet", "golden_helmet", "leather_helmet"];
const chestplates = ["netherite_chestplate", "diamond_chestplate", "iron_chestplate", "golden_chestplate", "leather_chestplate"];
const leggings = ["netherite_leggings", "diamond_leggings", "iron_leggings", "golden_leggings", "leather_leggings"];
const boots = ["netherite_boots", "diamond_boots", "iron_boots", "golden_boots", "leather_boots"];

async function equipArmorItem(bot, armorList, slot) {
    let bestItem;
    let bestIndex;

    for (const item of bot.inventory.slots) {
        if (!item) continue;

        const index = armorList.indexOf(item.name);
        if (index === -1) continue;

        if (bestItem === undefined || index < bestIndex) {
            bestItem = item;
            bestIndex = index;
        }
    }

    if (bestItem) {
        try {
            await bot.equip(bestItem, slot);
        } catch (err) {
            bot.emit("customLog", `⚠ Failed to equip ${bestItem.name} in slot ${slot}: ${err.message}`);
        }
    }
}

module.exports = (bot) => {
    bot.armor = {};

    bot.armor.equip = async () => {
        // Equip all armor pieces in parallel
        await Promise.all([
            equipArmorItem(bot, helmets, "head"),
            equipArmorItem(bot, chestplates, "torso"),
            equipArmorItem(bot, leggings, "legs"),
            equipArmorItem(bot, boots, "feet"),
        ]);
    };

    bot.commands.equiparmor = async ({ log }) => {
        await bot.armor.equip();
        log("✅ Armor equipped.");
    };

    bot.on("playerCollect", async (collector, _collected) => {
        if (collector !== bot.entity) return;
        await bot.armor.equip();
    });

    // Optional: equip armor automatically after respawn
    bot.on("respawn", async () => {
        await bot.armor.equip();
    });
};
