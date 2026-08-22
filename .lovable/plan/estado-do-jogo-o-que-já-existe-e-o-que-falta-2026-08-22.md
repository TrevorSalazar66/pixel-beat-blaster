# Estado do jogo: o que já existe e o que falta

## Já implementado

### Sequenciador e blocos de som
- Loop de 16 passos assíncrono e contínuo, com playhead disparando som + efeito a partir do personagem.
- 4 trilhas com Base / Variação A / Variação B: Kick (tiro pesado, Sub-Kick duplo, Explosive Kick AoE), Snare (pulso de repulsão, Shield Snare, Stun Snare), Hi-Hat (leque triplo, Dash Hat, Homing Hat), Synth (poça de dano, Beam Synth, Vamp Bass).
- Áudio com distorção (drive) e fade-out; timbres distintos por variação.
- Knockback ajustado: Kick com 5% de empurrão leve, poça Synth com 30% de repulsão por tick.
- Cada projétil já carrega um campo de "skin" (`square`, `circle`, `triangle`, `diamond`, `star`) definido por variação.

### Progressão, loja e forja
- Preços da loja multiplicados pelo andar.
- Sala de Forja (⚒, semi-rara em becos sem saída) com taxa por andar: juntar blocos iguais dá bloco normal, 15% de virar A ou B.
- Blocos variantes são fixos no sequenciador; drops nas salas só geram blocos normais.
- Inventário separado para blocos A e B, com UI da mochila e modal da forja.

### Salas, perigos e minimapa
- Layouts: Padrão, L, T, Ilha (fosso central) e Pilares destrutíveis.
- Pisos de ritmo: BPM +20 / -20 e Piso Amplificador (dobra tamanho e dano dos tiros).
- Caixa de Som Infectada como spawner rítmico com orçamento limitado.
- Minimapa com névoa: só salas visitadas (mais a atual) aparecem.

### Inimigos e bosses
- Base: Perseguidor, Torre, Glitch voador, Siren, Bass-Dropper, Laser-Sniper (cadência reduzida).
- Elites: Perseguidor Distorcido (investida), Torre Tripla (rajada em leque), Glitch Teleporte, Siren Curandeira, Bass-Quake (onda dupla).
- 3 bosses sorteados na sala de boss: Maestro Subwoofer (3 fases, 4 padrões), Sub-Esfera Ricochete (ricochete acelerando, divide em 2 e 4 corpos menores) e Trigon Espiral (gira atirando pelas 3 pontas).
- Emboscada pentagonal com 25% de chance ao limpar sala normal: laser sniper rápido, bombas flutuantes com explosão em área e triângulos teleguiados lentos.

### Mobile
- Analógico invisível livre na metade superior para movimento; analógico de tiro mantido na metade inferior.
- HUD por ancoragem relativa (canto + offset em %) para não quebrar em paisagem: vida/moedas no topo-esquerda, minimapa/andar no topo-direita, botões MIX/INV/CONFIG no topo-centro, cantos inferiores livres.

### Limpeza de bugs
- Inimigos contidos dentro da sala; limite de 12 inimigos vivos por sala.
- Cooldowns corrigidos (sem tiro infinito) e checagem de linha de visão.
- Drops sempre em piso alcançável (busca em espiral).

## O que falta

1. **Desenho das novas formas no canvas.** A simulação já usa círculo, triângulo e pentágono, mas o render ainda desenha todo inimigo (e boss) como quadrado, ignorando o campo `shape`. Falta desenhar círculo, triângulo com rotação (`ang`) e pentágono, além do aro/telegraph coerente durante o spawn.
2. **Skins visuais dos tiros do jogador.** Os projéteis já têm o campo `shape` por variação, mas o render pinta todos como quadrado. Falta desenhar diamante, estrela, círculo e triângulo (com rastro/brilho por variação) para diferenciar visualmente cada bloco.

## Detalhes técnicos
Ambos os itens ficam em `src/components/game/NeonDungeon.tsx`, no bloco de render: os laços `/* enemies */` e `/* shots */`. A solução é um helper de polígono (`drawPoly(ctx, x, y, r, lados, rotação)`) usado nos dois laços, lendo `getDef(e.defId).shape` para inimigos e `s.shape` para projéteis, mantendo glow, hitFlash, barra de vida e alpha de stun atuais. Nenhuma mudança de lógica de jogo é necessária.
