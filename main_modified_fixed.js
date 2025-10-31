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


// ====== Ultimatron Enhancements Injected (FIXED) ======
import * as mc from "@minecraft/server";

// Throttle tick work to every N ticks to reduce spam (10 ticks ≈ 0.5s)
const TICK_THROTTLE = 10;
let tickCounter = 0;

function getEquipmentItems(entity) {
    // Try several component names and patterns across Bedrock API versions
    try {
        // Common: equipment_inventory component with getEquipment(slot)
        const equipInv = entity.getComponent && (entity.getComponent("minecraft:equipment_inventory") || entity.getComponent("equipment_inventory"));
        if (equipInv) {
            try {
                return [
                    equipInv.getEquipment ? equipInv.getEquipment("head") : null,
                    equipInv.getEquipment ? equipInv.getEquipment("chest") : null,
                    equipInv.getEquipment ? equipInv.getEquipment("legs") : null,
                    equipInv.getEquipment ? equipInv.getEquipment("feet") : null,
                ];
            } catch (e) {}
        }

        // Another common pattern: 'minecraft:equippable' or 'equippable' component on mobs/players
        const equippable = entity.getComponent && (entity.getComponent("minecraft:equippable") || entity.getComponent("equippable"));
        if (equippable && equippable.getEquipment) {
            try {
                return [
                    equippable.getEquipment("head"),
                    equippable.getEquipment("chest"),
                    equippable.getEquipment("legs"),
                    equippable.getEquipment("feet"),
                ];
            } catch (e) {}
        }

        // Fallback: some entities expose 'armor' as a simple property (unlikely but safe)
        if (entity.armor && Array.isArray(entity.armor)) {
            return [
                entity.armor[0] || null,
                entity.armor[1] || null,
                entity.armor[2] || null,
                entity.armor[3] || null,
            ];
        }
    } catch (e) {
        // ignore and return null list
    }
    return [null, null, null, null];
}

// Helper to extract an identifier string from an item object across API versions
function getItemId(item) {
    if (!item) return null;
    if (typeof item === "string") return item;
    // Try common properties used by various APIs
    const props = ["typeId", "id", "__identifier__", "itemType", "stackId"];
    for (const p of props) {
        if (item[p]) return String(item[p]);
    }
    // Some components wrap the item inside 'item' or 'itemStack'
    if (item.item && item.item.typeId) return String(item.item.typeId);
    if (item.itemStack && item.itemStack.typeId) return String(item.itemStack.typeId);
    return null;
}

// Apply effects using the entity.addEffect API when available, otherwise fallback to runCommandAsync
async function applyEffectsSafely(entity, regenLevel, resistLevel) {
    try {
        // Normalize amplifier values: script API usually uses amplifier value where 0 = level I
        const regenAmp = Math.max(0, regenLevel - 1);
        const resistAmp = Math.max(0, resistLevel - 1);

        // Duration in ticks: we'll give 20 ticks (1 second) and refresh every throttle interval
        const durationSeconds = Math.ceil(TICK_THROTTLE / 20) + 2; // safe buffer in seconds
        const durationTicks = durationSeconds * 20;

        // Prefer entity.addEffect if present
        if (typeof entity.addEffect === "function") {
            // Use namespaced effect ids
            const regenId = "minecraft:regeneration";
            const resistId = "minecraft:resistance";
            try {
                entity.addEffect(regenId, durationTicks, { amplifier: regenAmp, showParticles: false });
                entity.addEffect(resistId, durationTicks, { amplifier: resistAmp, showParticles: false });
                return;
            } catch (e) {
                // fall through to command fallback
            }
        }

        // Fallback: use runCommandAsync on the entity's unique id if available
        const dim = mc.world.getDimension("overworld") || mc.world.getDimension("minecraft:overworld");
        if (!dim) return;
        // Try to build a selector using the entity's id (runtime id)
        const runtimeId = entity.id || entity.__id__ || entity.runtimeId;
        if (runtimeId !== undefined && runtimeId !== null) {
            // Command expects seconds for duration; amplifier is level-1 for /effect command in Bedrock
            const regenCmd = `effect @e[r=${0},rm=0,tag=,limit=1] clear`;
            // Simpler: use target by unique runtime id via `@e` with `family` isn't reliable.
            // Use /effect with target selector by name if entity has a name; otherwise skip fallback.
            const name = entity.nameTag || entity.name || "";
            if (name) {
                await dim.runCommandAsync(`effect "${name}" clear minecraft:regeneration`);
                await dim.runCommandAsync(`effect "${name}" clear minecraft:resistance`);
                await dim.runCommandAsync(`effect "${name}" minecraft:regeneration ${durationSeconds} ${regenAmp}`);
                await dim.runCommandAsync(`effect "${name}" minecraft:resistance ${durationSeconds} ${resistAmp}`);
            }
        }
    } catch (e) {
        // silent
    }
}

// Tick handler
mc.world.afterEvents.tick.subscribe((ev) => {
    try {
        tickCounter++;
        if (tickCounter % TICK_THROTTLE !== 0) return;

        const all = mc.world.getAllEntities();
        for (const entity of all) {
            if (!entity) continue;

            try {
                const items = getEquipmentItems(entity);
                let count = 0;
                for (const it of items) {
                    const id = getItemId(it);
                    if (!id) continue;
                    if (id === "ultimatron_helmet" ||
                        id === "ultimatron_chestplate" ||
                        id === "ultimatron_leggings" ||
                        id === "ultimatron_boots") {
                        count++;
                    }
                }

                if (count > 0) {
                    // Determine desired numeric levels (1..5)
                    let regenLevel = count === 4 ? 5 : count;   // 4 pieces => Reg V, else 1..3
                    let resistLevel = count === 4 ? 5 : count;
                    // Use entity.addEffect if available synchronously, otherwise call async fallback
                    applyEffectsSafely(entity, regenLevel, resistLevel);
                }
            } catch (e) {
                // per-entity safe guard
            }
        }
    } catch (e) {
        // overall tick safe guard
    }
});

// Entity hurt handler for Ultimatron multitool
mc.world.afterEvents.entityHurt.subscribe((ev) => {
    try {
        const { damageSource, hurtEntity } = ev;
        if (!damageSource || !hurtEntity) return;
        const attacker = damageSource.damagingEntity;
        if (!attacker) return;

        const items = getEquipmentItems(attacker);
        // mainhand is not always in equipment slots; check common property 'hand', 'mainhand', or equippable component
        let mainhand = null;
        try {
            // check equippable mainhand via equippable component
            const equippable = attacker.getComponent && (attacker.getComponent("minecraft:equippable") || attacker.getComponent("equippable"));
            if (equippable && equippable.getEquipment) {
                mainhand = equippable.getEquipment("mainhand") || equippable.getEquipment("hand") || equippable.getEquipment("slot.weapon");
            }
        } catch (e) {}

        // fallback: check 'hand' or 'selectedItem' properties on the attacker object
        if (!mainhand && (attacker.selectedItem || attacker.hand || attacker.getComponent && attacker.getComponent("minecraft:hand_container"))) {
            const maybe = attacker.selectedItem || attacker.hand;
            if (maybe) mainhand = maybe;
        }

        // As a last resort, check the equipment array
        if (!mainhand && Array.isArray(items)) {
            // No reliable mainhand slot in fallback; assume chest slot isn't mainhand; skip if unknown
            mainhand = null;
        }

        const mainId = getItemId(mainhand);
        if (mainId === "ultimatron_multitool") {
            try {
                // Use applyDamage if available
                if (typeof hurtEntity.applyDamage === "function") {
                    hurtEntity.applyDamage(1000000);
                } else {
                    // Fallback to runCommandAsync kill by name if available
                    const dim = mc.world.getDimension("overworld") || mc.world.getDimension("minecraft:overworld");
                    const name = hurtEntity.nameTag || hurtEntity.name || "";
                    if (dim && name) {
                        dim.runCommandAsync(`kill "${name}"`);
                    }
                }
            } catch (e) {
                // silent
            }
        }
    } catch (e) {
        // silent
    }
});

// ====== End Ultimatron Enhancements ======
