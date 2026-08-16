# Remix of Neon Beat Runner

MÓDULO 1: CORE MVP, PERSONAGEM E AMBIENTE BASE

1. Visão Geral do MVP

Estilo Visual: Pixel art neon minimalista retro (Cyberpunk 8-bit).

Stack Recomendada: React + HTML5 Canvas (ou Tailwind CSS) + Web Audio API.

Objetivo do Módulo: Ter uma sala navegável com movimentação do jogador e o sequenciador de som atirando no ritmo.

2. O Personagem (Player)

Representação Visual: Conjunto de 3 blocos de pixels coloridos dispostos na vertical/horizontal (ex: Topo Azul Neon, Meio Roxo Neon, Base Amarela Neon) com um leve efeito de brilho (glow CSS/Canvas).

Tamanho: 32x32px (ou proporcional à grade da sala).

Controles de Movimento:

Teclas: WASD ou Setas do Teclado (ArrowUp, ArrowDown, ArrowLeft, ArrowRight).

Colisão: Não pode atravessar as paredes da sala.

3. O Ambiente Base (Sala Fixa da Masmorra)

Estrutura: Uma sala retangular fixa (ex: grade 16x9 ou Canvas de 800x450px).

Visual: Fundo escuro (#0d0f18), paredes com contorno neon brilhante (ex: Cyan/Magenta).

Limites: Paredes invisíveis nos 4 cantos para delimitar a área de movimento do personagem.

4. O Sequenciador de Ritmo (The Step Sequencer)

Estrutura Visual: Uma barra superior (ou inferior) fixa com 16 passos (steps) dividida em 4 canais (Trilhas):

Kick / Ataque Direcional (Vermelho)

Snare / Escudo Temporário (Azul)

Hi-Hat / Disparo Rápido (Amarelo)

Synth / Especial em Área (Roxo)

Mecânica de Áudio:

Tocador em Loop contínuo (Playhead) rodando em 120 BPM usando a Web Audio API (Osciladores sintéticos para som 8-bit, sem arquivos MP3/WAV externos).

Mecânica de Ação:

Quando o marcador passa por um bloco ativado no sequenciador:

Toca o som chiptune daquela trilha.

Dispara a ação correspondente no jogo a partir da posição do jogador (ex: projétil neon voando na direção que o jogador está olhando).


Não pergunte, execute

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pixel-beat-blaster.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/67cccd50-6a9e-44c0-97a7-924c500cf80d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
