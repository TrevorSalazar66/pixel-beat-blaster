export type ShopItemId = "heal" | "maxhp" | "rare" | "bpm";

export type ShopItem = {
  id: ShopItemId;
  label: string;
  desc: string;
  cost: number;
  color: string;
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: "heal", label: "Vida +1", desc: "Restaura 1 HP", cost: 10, color: "#ff2e5b" },
  { id: "maxhp", label: "HP Máx +1", desc: "Aumenta vida máxima", cost: 25, color: "#3dff9e" },
  { id: "rare", label: "Bloco Raro", desc: "Tiro duplo/penetrante", cost: 20, color: "#ffffff" },
  { id: "bpm", label: "BPM +10", desc: "Acelera o ritmo", cost: 15, color: "#ffe23d" },
];

/** Preço escala com o andar: custo base x numero do andar. */
export const itemCost = (item: ShopItem, level: number) =>
  Math.max(item.cost, Math.round(item.cost * Math.max(1, level)));

/** Taxa da Forja, tambem escalada pelo andar. */
export const FORGE_FEE_BASE = 12;
export const forgeFee = (level: number) => FORGE_FEE_BASE * Math.max(1, level);
/** Blocos normais iguais consumidos por tentativa. */
export const FORGE_INPUT = 2;
/** Chance de sair variacao A e de sair variacao B. */
export const FORGE_VARIANT_CHANCE = 0.15;
