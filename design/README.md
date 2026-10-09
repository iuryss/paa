Plataforma educacional para crianças com TEA. A interface é um porto seguro: a mesma estrutura em toda tela, um estímulo por vez, nenhum susto. Toda decisão abaixo serve a três regras: **previsível**, **calma**, **tolerante ao erro**.

## Princípios

1. **Uma tela, uma tarefa.** Toda atividade segue a mesma ordem vertical: instrução (`title` + `subtitle`) → área de jogo → ações. A posição dos botões nunca muda entre telas.
2. **Uma ação primária por tela.** Um único botão `primary`. Todo o resto é secundário ou some.
3. **Nada acontece sozinho.** Sem cronômetro, sem autoplay de som, sem carrossel, sem avanço automático. Movimento só como resposta direta a um gesto da criança.
4. **Errar é tentar.** Não existe estado "erro" na atividade: existe `retry` — um convite gentil para tentar de novo. Proibido: vermelho, "X", som de buzina, tremor de tela, contador de erros visível à criança.
5. **Cor nunca sozinha.** Todo estado (acerto, redirecionamento, ativo) carrega palavra + ícone + forma, além da cor.
6. **O tema é da criança.** O perfil sensorial (`calmo`, `foco`, `contraste`) é salvo no perfil da criança no back-end e aplicado antes do primeiro paint — nunca trocado automaticamente.

## Temas sensoriais

Os tokens são semânticos; o tema troca só os valores. Aplicar com `data-theme` no `<html>`:

```html
<html data-theme="calmo">   <!-- Baixo Estímulo (padrão) -->
<html data-theme="foco">    <!-- Foco Alto -->
<html data-theme="contraste"><!-- Alto Contraste -->
```

- **Baixo Estímulo (`calmo`)** — padrão. Família `slate` (azul acinzentado), verde-menta (`emerald-100/200`) para acerto, azul-céu claro (`sky-200`) para ação. Nunca branco puro de fundo.
- **Foco Alto (`foco`)** — monocromático `zinc` + **uma** cor: `teal`. Acerto também usa `teal`; redirecionamento é neutro (`zinc`). Para crianças que se distraem com cor.
- **Alto Contraste (`contraste`)** — fundo preto, texto branco, ação em `yellow-300`. Todo texto ≥ 7:1 (WCAG AAA). Superfícies separadas por borda branca, nunca por sombra.

### Mapa token → classe Tailwind

| Token | Classe gerada | `calmo` | `foco` | `contraste` |
|---|---|---|---|---|
| `page` | `bg-page` | `slate-100` | `zinc-100` | `black` |
| `surface` | `bg-surface` | `slate-50` | `white` | `neutral-950` |
| `surface-sunken` | `bg-surface-sunken` | `slate-200` | `zinc-200` | `zinc-900` |
| `ink` | `text-ink` | `slate-700` | `zinc-900` | `white` |
| `ink-muted` | `text-ink-muted` | `slate-600` | `zinc-600` | `zinc-300` |
| `border` | `border-border` | `slate-500` | `zinc-500` | `white` |
| `border-subtle` | `border-border-subtle` | `slate-300` | `zinc-300` | `zinc-500` |
| `primary` | `bg-primary` | `sky-200` | `teal-700` | `yellow-300` |
| `on-primary` | `text-on-primary` | `sky-900` | `white` | `black` |
| `primary-border` | `border-primary-border` | `sky-700` | `teal-800` | `yellow-300` |
| `accent` | `bg-accent` | `emerald-200` | `teal-100` | `yellow-300` |
| `on-accent` | `text-on-accent` | `slate-700` | `zinc-900` | `black` |
| `success-bg` | `bg-success-bg` | `emerald-100` | `teal-50` | `black` |
| `success-ink` | `text-success-ink` | `emerald-800` | `teal-800` | `emerald-300` |
| `success-border` | `border-success-border` | `emerald-600` | `teal-700` | `emerald-300` |
| `retry-bg` | `bg-retry-bg` | `amber-50` | `zinc-50` | `black` |
| `retry-ink` | `text-retry-ink` | `amber-900` | `zinc-800` | `sky-300` |
| `retry-border` | `border-retry-border` | `amber-700` | `zinc-500` | `sky-300` |
| `drop-bg` | `bg-drop-bg` | `slate-50` | `white` | `black` |
| `drop-border` | `border-drop-border` | `slate-500` | `zinc-500` | `white` |
| `drop-active-bg` | `bg-drop-active-bg` | `sky-100` | `teal-50` | `zinc-900` |
| `drop-active-border` | `border-drop-active-border` | `sky-700` | `teal-700` | `yellow-300` |
| `focus-ring` | `ring-focus-ring` | `sky-800` | `zinc-900` | `cyan-300` |
| `disabled-bg` | `bg-disabled-bg` | `slate-200` | `zinc-200` | `zinc-900` |
| `disabled-ink` | `text-disabled-ink` | `slate-600` | `zinc-600` | `zinc-300` |

Contraste verificado (WCAG 2, fórmula de luminância relativa) em todos os temas: texto ≥ 4.5:1 em `calmo` e `foco` (menor par: `on-primary`/`primary` no `foco`, 5.5:1), ≥ 7:1 em `contraste` (menor: `disabled-ink`/`disabled-bg`, 12:1); bordas e anel de foco ≥ 3:1 (menor: `success-border`/`success-bg` no `calmo`, 3.3:1). No `calmo`, `primary` quase some contra `page` por design (fundo suave) — quem separa o botão é `primary-border` (5.4:1). Nunca remover essa borda.

### Ligando ao Tailwind

Os valores hex correspondem à paleta padrão do **Tailwind v3**. No v4 a paleta foi redefinida em OKLCH: os nomes das classes são os mesmos, os valores mudam levemente — recalcular contraste se usar o v4 puro.

**Tailwind v3** (`tailwind.config.ts`), lendo as variáveis CSS geradas a partir de `tokens.json`:

```ts
const t = (n: string) => `var(--${n})`;
export default {
  darkMode: ["selector", '[data-theme="contraste"]'],
  theme: {
    extend: {
      colors: Object.fromEntries([
        "page","surface","surface-sunken","ink","ink-muted","border","border-subtle",
        "primary","on-primary","primary-border","accent","on-accent",
        "success-bg","success-ink","success-border","retry-bg","retry-ink","retry-border",
        "drop-bg","drop-border","drop-active-bg","drop-active-border",
        "focus-ring","disabled-bg","disabled-ink",
      ].map((n) => [n, t(n)])),
      fontFamily: { sans: ["Nunito", "ui-rounded", "system-ui", "sans-serif"],
                    letra: ["Andika", "Nunito", "sans-serif"],
                    cursiva: ['"Playwrite BR"', "cursive"],
                    leitura: ['"Atkinson Hyperlegible"', "Nunito", "sans-serif"] },
      minHeight: { target: "64px", "target-lg": "88px" },
    },
  },
};
```

Limitação: com `var(--x)` puro, modificadores de opacidade (`bg-primary/50`) não funcionam no v3. Não precisamos deles — transparências reduzem contraste.

**Tailwind v4**: o equivalente é declarar `--color-page: var(--page);` etc. dentro de `@theme inline { … }` no CSS. Confirme a sintaxe atual na documentação oficial antes de adotar.

**ShadCN UI**: mapear as variáveis do ShadCN para os nossos tokens, por tema — `--background`→`page`, `--foreground`→`ink`, `--card`→`surface`, `--primary`→`primary`, `--primary-foreground`→`on-primary`, `--muted`→`surface-sunken`, `--muted-foreground`→`ink-muted`, `--accent`→`accent`, `--accent-foreground`→`on-accent`, `--border`/`--input`→`border`, `--ring`→`focus-ring`. `--destructive` aponta para `retry-border`, nunca para vermelho; componentes ShadCN destrutivos (excluir conta etc.) ficam fora das telas da criança.

## Tipografia

- **`sans` — Nunito** (Google Fonts). Toda a interface. Terminais arredondados, formas abertas, boa leitura em tamanhos grandes. Pesos usados: 600, 700, 800.
- **`letra` — Andika** (SIL, Google Fonts). Conteúdo de alfabetização em **letra bastão**. Desenhada para alfabetização: `a` e `g` de um andar, `I` / `l` / `1` bem distintos.
- **`cursiva` — Playwrite BR** (Google Fonts, família Playwrite da TypeTogether, modelo de caligrafia escolar brasileira). Só nos encaixes cursivos. Validar o traçado com a pedagoga antes de usar — o modelo de cursiva varia por escola.
- **`leitura` — Atkinson Hyperlegible** (Braille Institute). Opção de perfil para quem já lê frases ou tem baixa visão.
- **OpenDyslexic**: não é padrão. Oferecer apenas como opção no perfil, se a família pedir. Estudo controlado não encontrou ganho de velocidade nem de precisão de leitura com ela (Wery & Diliberto, *Annals of Dyslexia*, 2017), e dislexia não é TEA.

Escala (estilos em `tokens.json`): `display` 48/56, `title` 32/40, `subtitle` 24/32, `body` 20/30, `label` 18/24, `button` 22/28, `numeral` 72/80, `letra-bastao` 64/72, `letra-cursiva` 56/88, `leitura` 22/34.

Regras: nenhum texto lido pela criança abaixo de 18px. Alinhamento sempre à esquerda (exceto letras/números isolados em cards, centralizados). Nunca itálico, nunca CAIXA ALTA em frases (letra bastão é conteúdo, não estilo). Linha máxima: ~45 caracteres (`max-w-[28ch]` em `title`).

## Espaço e alvos de toque

- Alvo mínimo `target-min` 64px (`min-h-16 min-w-16`); botão principal e cards arrastáveis `target-lg` 88px. 64px é decisão do projeto — o mínimo AAA da WCAG (2.5.5) é 44px; crianças com dificuldade motora precisam de mais.
- Entre dois alvos vizinhos, no mínimo `space-6` (24px, `gap-6`). Zonas da tela (instrução / jogo / ações) separadas por `space-12` (`gap-12`).
- Área de ações fixa no rodapé da tela, mesma altura e posição em todo módulo.

## Botões

Três variantes, e só três. Todas: `min-h-[88px]` (principal) ou `min-h-16`, `rounded-[20px]`, `border-2`, estilo `button`, ícone à esquerda do rótulo com `gap-2`, foco visível.

| Variante | Quando | Classes |
|---|---|---|
| Principal | A única ação que avança ("Continuar", "Pronto!") | `bg-primary text-on-primary border-2 border-primary-border` |
| Secundária | Ações de apoio ("Ouvir de novo", "Voltar") | `bg-surface text-ink border-2 border-border` |
| Ícone | Ação recorrente de posição fixa (áudio, ajuda) | `size-16 rounded-full bg-surface text-ink border-2 border-border` + `aria-label` |

Base comum:

```
inline-flex items-center justify-center gap-2 px-8 font-sans text-[22px] leading-7 font-extrabold
rounded-[20px] border-2 select-none touch-manipulation
focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-[3px] focus-visible:ring-offset-page
motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]
```

Faça:

- Rótulo curto (1–2 palavras) + ícone sempre presente; o ícone sozinho só na variante Ícone.
- Pressionado = leve afundamento (`active:scale-[0.97]`) apenas com `motion-safe`; sem animação em `motion-reduce`.
- Estado indisponível (`bg-disabled-bg text-disabled-ink border-transparent`) só quando a criança entende por quê — prefira mostrar o botão apenas quando a ação faz sentido.

Não faça:

- Informação só no hover (crianças usam toque).
- Dois botões principais na mesma tela, ou botão principal mudando de posição.
- Pressionar-e-segurar ou duplo toque para ações essenciais.
- Confirmação em diálogo modal dentro da atividade.

## Feedback: acerto e redirecionamento

- **Acerto** — `bg-success-bg text-success-ink border-2 border-success-border`, ícone de check arredondado + frase específica ("Isso! A escola fica no Norte."). O elemento encaixado permanece no lugar, com borda `success-border`. Som opcional, curto, suave, volume baixo, desligável no perfil.
- **Redirecionamento** (substitui "erro") — `bg-retry-bg text-retry-ink border-2 border-retry-border`, ícone de seta circular/lâmpada + convite ("Quase! Tente perto da árvore."). O card volta sozinho, devagar, para a bandeja de origem (mola lenta). Nenhum som de falha. Após 2 tentativas, a dica fica mais concreta (ex.: o encaixe certo ganha `drop-active-border`); nunca revelar com punição.
- Feedback aparece sempre no mesmo lugar (acima da área de ações), substitui o anterior e não some sozinho em menos de 4s — a criança fecha ou segue.

## Movimento

- Só em resposta direta a um gesto (arrastar, soltar, tocar). Nada em loop, nada piscando, nada entrando sozinho na tela.
- Molas lentas e sem quique. Referência para Framer Motion: `{ type: "spring", stiffness: 120, damping: 22, mass: 1 }` para retorno de card; `{ stiffness: 260, damping: 30 }` para encaixe. Valores são ponto de partida — ajustar em teste com crianças.
- Respeito estrito a `prefers-reduced-motion`: envolver a app em `<MotionConfig reducedMotion="user">` e, em Tailwind, usar apenas `motion-safe:` para transições. Em movimento reduzido, card vai direto à posição final (sem interpolação) e o feedback aparece sem fade.
- O pacote `framer-motion` passou a ser publicado também como `motion` (import `motion/react`); confirme o nome e as APIs na documentação da versão instalada.

## Foco e acessibilidade

- Anel de foco: `ring-4 ring-focus-ring ring-offset-[3px] ring-offset-page`, sólido, ≥ 3:1 em todos os temas. Nunca `outline-none` sem substituto.
- Toda atividade de arrastar tem alternativa por toque (tocar no card, depois tocar no encaixe) e por teclado.
- Cada card e encaixe tem `aria-label` falado ("Letra A maiúscula", "Encaixe da letra a cursiva").

## Iconografia

- Ainda sem conjunto de ícones definido. Requisito: traço grosso (≥ 2px a 24px), cantos arredondados, preenchimento simples, um ícone = um significado em toda a plataforma.
- Ícones sempre em `currentColor` herdando `ink`, `on-primary`, `success-ink` ou `retry-ink`. Tamanho mínimo 28px em botões.
- Sem emoji na interface: a renderização muda por sistema e quebra a previsibilidade.

## Linguagem

- Frases curtas, voz direta, segunda pessoa ("Arraste a casinha"). Um verbo por instrução.
- Elogio específico, não genérico: "Você achou o Leste!" em vez de "Parabéns!!!".
- Nunca: "errado", "não", "falhou", pontos de exclamação múltiplos, ironia, metáforas ("está quente/frio").
- Toda instrução escrita tem botão "Ouvir" ao lado (mesma posição sempre).
