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
