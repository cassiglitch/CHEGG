import { system, world } from "@minecraft/server";

// Track each player's last chestplate
const chestplateState = new Map();

// Utility: get the current chestplate ID
function getChestplateType(player) {
  const equip = player.getComponent("minecraft:equippable");
  if (!equip) return null;
  const chest = equip.getEquipment("Chest");
  return chest ? chest.typeId : null;
}

// Handle mayfly toggling efficiently
function handleMayflyToggle(player) {
  const currentChest = getChestplateType(player);
  const prevChest = chestplateState.get(player.id);

  // If chestplate changed since last tick
  if (currentChest !== prevChest) {
    const hasUltimatron = currentChest === "ultimatron:chestplate";

    try {
      player.runCommand(`ability @s mayfly ${hasUltimatron ? "true" : "false"}`);
    } catch (e) {
      // Fallback in case runCommand fails
      try {
        const mayfly = player.getComponent("minecraft:mayfly");
        if (mayfly) mayfly.setMayfly(hasUltimatron);
      } catch {}
    }

    // Update stored state
    chestplateState.set(player.id, currentChest);
  }
}

// Main loop (runs every second)
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player || !player.isValid()) continue;

    const equip = player.getComponent("minecraft:equippable");
    if (!equip) continue;

    const head = equip.getEquipment("Head");
    const chest = equip.getEquipment("Chest");
    const legs = equip.getEquipment("Legs");
    const feet = equip.getEquipment("Feet");

    let pieces = 0;
    const hasHelmet = head && head.typeId === "ultimatron:helmet";
    const hasChest = chest && chest.typeId === "ultimatron:chestplate";
    const hasLegs = legs && legs.typeId === "ultimatron:leggings";
    const hasBoots = feet && feet.typeId === "ultimatron:boots";

    if (hasHelmet) pieces++;
    if (hasChest) pieces++;
    if (hasLegs) pieces++;
    if (hasBoots) pieces++;

    // Damage reduction logic
    let resistanceLevel = 0;
    if (pieces === 1) resistanceLevel = 1;
    else if (pieces === 2) resistanceLevel = 2;
    else if (pieces === 3) resistanceLevel = 4;
    else if (pieces === 4) resistanceLevel = 5;

    if (resistanceLevel > 0) {
      player.addEffect("resistance", 40, {
        amplifier: resistanceLevel - 1,
        showParticles: false,
      });
      player.addEffect("regeneration", 40, {
        amplifier: resistanceLevel - 1,
        showParticles: false,
      });
    }

    // Helmet effects
    if (hasHelmet) {
      player.addEffect("water_breathing", 40, { showParticles: false });
      player.addEffect("night_vision", 300, { showParticles: false });
    }

    // Handle mayfly efficiently (only on change)
    handleMayflyToggle(player);
  }
}, 20);

world.afterEvents.entityHitEntity.subscribe(event => {
  const { hitEntity, damagingEntity } = event;
  if (!hitEntity || !damagingEntity) return;

  // Check if the attacker is holding your custom weapon
  const item = damagingEntity.getComponent("minecraft:equippable").getEquipment("mainhand");
  if (item && item.typeId === "ultimatron:multitool") {
    // Instantly kill the entity
    hitEntity.kill();
  }
});
