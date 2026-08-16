import { useState, useEffect } from "react";
import { auth, loginWithGoogle, logoutUser, subscribeToAuth } from "@/lib/firebase";
import { supabase, type PlayerRun, getTopLeaderboard } from "@/lib/supabase";
import { NeonDungeon } from "./NeonDungeon";
import { type User } from "firebase/auth";

export function MainMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [hasName, setHasName] = useState<boolean>(false);
  const [screen, setScreen] = useState<"LOGIN" | "NAME_SELECT" | "MENU" | "GAME" | "RANK" | "CONFIG">("LOGIN");
  const [leaderboard, setLeaderboard] = useState<PlayerRun[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [audioVolume, setAudioVolume] = useState<number>(80);

  // Escuta autenticação do Firebase
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Carrega nome do localStorage ou Supabase
        const savedName = localStorage.getItem(`player_name_${currentUser.uid}`) || currentUser.displayName || "";
        if (savedName) {
          setPlayerName(savedName);
          setHasName(true);
          setScreen("MENU");
        } else {
          setScreen("NAME_SELECT");
        }
      } else {
        setScreen("LOGIN");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await loginWithGoogle();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = () => {
    if (!playerName.trim() || !user) return;
    localStorage.setItem(`player_name_${user.uid}`, playerName.trim());
    setHasName(true);
    setScreen("MENU");
  };

  const openLeaderboard = async () => {
    setLoading(true);
    setScreen("RANK");
    const data = await getTopLeaderboard(15);
    setLeaderboard(data ?? []);
    setLoading(false);
  };

  if (screen === "GAME") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <button
          onClick={() => setScreen("MENU")}
          className="self-start mb-2 px-3 py-1 text-[8px] font-pixel text-muted-foreground border border-muted-foreground/30 hover:text-neon-cyan hover:border-neon-cyan"
        >
          ← Voltar ao Menu
        </button>
        <NeonDungeon />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 font-pixel text-foreground select-none">
      <div className="relative w-full max-w-md border border-neon-cyan/40 bg-panel/90 p-8 shadow-[0_0_25px_rgba(46,200,255,0.2)] rounded-lg flex flex-col items-center gap-6">
        
        {/* Título Principal */}
        <div className="text-center">
          <h1 className="text-2xl text-neon-magenta drop-shadow-[0_0_12px_rgba(255,61,240,0.8)] tracking-wider">
            NEON DUNGEON
          </h1>
          <p className="text-[8px] text-neon-cyan mt-2 tracking-widest opacity-80">
            BIT SHOOTER ROGUELIKE
          </p>
        </div>

        {/* 1. Tela de Login com Firebase */}
        {screen === "LOGIN" && (
          <div className="w-full flex flex-col items-center gap-5 mt-4">
            <p className="text-[9px] text-center text-muted-foreground leading-relaxed">
              Autentique-se com sua conta Google para salvar recordes, conquistas e subir no ranking!
            </p>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 px-4 bg-neon-cyan/20 border border-neon-cyan text-neon-cyan text-[10px] uppercase tracking-wider rounded-sm shadow-[0_0_10px_rgba(46,200,255,0.4)] hover:bg-neon-cyan/30 active:scale-95 transition-all"
            >
              {loading ? "Conectando..." : "🔑 Entrar com Google"}
            </button>
            <button
              onClick={() => {
                setPlayerName("Convidado");
                setScreen("MENU");
              }}
              className="text-[8px] text-muted-foreground hover:text-white underline mt-2"
            >
              Jogar como Visitante (Offline)
            </button>
          </div>
        )}

        {/* 2. Tela de Criação de Nome do Jogador */}
        {screen === "NAME_SELECT" && (
          <div className="w-full flex flex-col items-center gap-4 mt-2">
            <h2 className="text-[11px] text-neon-yellow">ESCOLHA SEU CODINOME</h2>
            <input
              type="text"
              maxLength={14}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Nome de Jogador"
              className="w-full bg-black/60 border border-neon-yellow/50 px-3 py-2 text-[10px] text-center text-neon-yellow focus:outline-none focus:border-neon-yellow"
            />
            <button
              onClick={handleSaveName}
              disabled={!playerName.trim()}
              className="w-full py-2.5 bg-neon-yellow/20 border border-neon-yellow text-neon-yellow text-[10px] uppercase rounded-sm hover:bg-neon-yellow/30 transition-all"
            >
              Confirmar
            </button>
          </div>
        )}

        {/* 3. Menu Principal */}
        {screen === "MENU" && (
          <div className="w-full flex flex-col items-center gap-3.5 mt-2">
            <div className="text-[8px] text-muted-foreground mb-2 flex items-center gap-2">
              <span className="text-neon-green">●</span> Piloto: <span className="text-white">{playerName}</span>
            </div>

            {/* PLAY */}
            <button
              onClick={() => setScreen("GAME")}
              className="w-full py-3 bg-neon-green/20 border border-neon-green text-neon-green text-[11px] uppercase rounded-sm shadow-[0_0_12px_rgba(61,255,158,0.4)] hover:bg-neon-green/30 active:scale-95 transition-all"
            >
              ▶ PLAY
            </button>

            {/* RANK DOS CAMPEÕES (Abaixo de Play e Acima de Config) */}
            <button
              onClick={openLeaderboard}
              className="w-full py-2.5 bg-neon-yellow/20 border border-neon-yellow text-neon-yellow text-[10px] uppercase rounded-sm shadow-[0_0_10px_rgba(255,226,61,0.3)] hover:bg-neon-yellow/30 active:scale-95 transition-all"
            >
              🏆 RANK DOS CAMPEÕES
            </button>

            {/* CONFIG */}
            <button
              onClick={() => setScreen("CONFIG")}
              className="w-full py-2.5 bg-neon-purple/20 border border-neon-purple text-neon-purple text-[10px] uppercase rounded-sm hover:bg-neon-purple/30 active:scale-95 transition-all"
            >
              ⚙ CONFIG
            </button>

            {/* Sair */}
            {user && (
              <button
                onClick={() => logoutUser()}
                className="text-[8px] text-neon-red/80 hover:text-neon-red mt-2 underline"
              >
                Desconectar
              </button>
            )}
          </div>
        )}

        {/* 4. Rank dos Campeões (Supabase) */}
        {screen === "RANK" && (
          <div className="w-full flex flex-col items-center gap-4">
            <h2 className="text-[11px] text-neon-yellow drop-shadow-[0_0_8px_rgba(255,226,61,0.6)]">
              🏆 HALL DA FAMA
            </h2>
            <div className="w-full max-h-56 overflow-y-auto border border-border bg-black/40 p-2 rounded flex flex-col gap-1.5 text-[8px]">
              {loading ? (
                <p className="text-center text-muted-foreground py-4">Carregando scores...</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Nenhum recorde registrado ainda.</p>
              ) : (
                leaderboard.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-border/30 pb-1">
                    <span className="text-neon-cyan">#{idx + 1} Andar {item.floor_reached}</span>
                    <span className="text-neon-magenta">{item.kills} Kills</span>
                    <span className="text-neon-yellow">{item.coins} ♪</span>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => setScreen("MENU")}
              className="w-full py-2 border border-muted-foreground/40 text-[9px] text-muted-foreground hover:text-white"
            >
              Voltar ao Menu
            </button>
          </div>
        )}

        {/* 5. Configurações */}
        {screen === "CONFIG" && (
          <div className="w-full flex flex-col items-center gap-4">
            <h2 className="text-[11px] text-neon-purple">CONFIGURAÇÕES</h2>
            <div className="w-full flex flex-col gap-2 text-[9px]">
              <label className="flex justify-between text-muted-foreground">
                <span>Volume de Som:</span>
                <span className="text-white">{audioVolume}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={audioVolume}
                onChange={(e) => setAudioVolume(Number(e.target.value))}
                className="w-full accent-neon-purple"
              />
            </div>
            <button
              onClick={() => setScreen("MENU")}
              className="w-full py-2 border border-neon-purple/50 text-[9px] text-neon-purple hover:bg-neon-purple/10 mt-2"
            >
              Salvar e Voltar
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
