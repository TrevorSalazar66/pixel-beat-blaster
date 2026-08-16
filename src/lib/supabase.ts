import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://anmavjztbnmykysjhtnc.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_wc99MIe9m4-PPv8cLfzxyw_oBCxbGGq";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type PlayerRun = {
  id?: string;
  user_id?: string;
  floor_reached: number;
  kills: number;
  coins: number;
  bpm: number;
  notes_count: number;
  pattern_data: string; // JSON serializado da matriz do sequencer
  created_at?: string;
};

export async function saveRunData(run: PlayerRun) {
  try {
    const { data, error } = await supabase.from("player_runs").insert([run]);
    if (error) {
      console.warn("Aviso ao salvar no Supabase (verifique chaves de ambiente):", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("Supabase offline / não configurado:", err);
    return null;
  }
}

export async function getTopLeaderboard(limit = 10) {
  try {
    const { data, error } = await supabase
      .from("player_runs")
      .select("*")
      .order("floor_reached", { ascending: false })
      .order("kills", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn("Erro ao buscar leaderboard:", err);
    return [];
  }
}
