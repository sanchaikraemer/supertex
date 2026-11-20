# Identidade visual — Supertex

Referência: https://supertex.com.br (site feito em Webflow)

## Situação
Cores e fonte **conferidas no código do site em 20/11/2026** e já aplicadas em `css/tema.css`.
Arquivo lido: https://cdn.prod.website-files.com/66a7787b7ed36b45613c93d2/css/supertex.webflow.shared.3c52d4107.css
(o nome desse arquivo muda quando o site é republicado).

## Como confirmar (tarefa para o Claude Code)
1. Abrir https://supertex.com.br e localizar o arquivo CSS do Webflow (`<link rel="stylesheet" ...website-files.com...css>`).
2. Anotar aqui:
   - cor principal (botões, destaques): vermelho **`#ed3237`** (no site: `--vermelho-supertex`; botão principal vermelho com texto branco).
     Vermelho mais escuro ao passar o mouse no botão: `#be1419`.
   - cor secundária: azul **`#135189`** (no site: `--azul-supertex`; rodapé, títulos grandes, botão azul com texto branco).
     Cores de apoio: dourado `#fcba30` (`--gold`, abas e detalhes) e laranja `#eb9f00` (`--dark-olive-green`, cor dos links).
   - cor do texto e do fundo: texto **`#242020`** (`--black`), fundo **`#fafafa`** (`--white`), branco `#ffffff` (`--white-2`),
     linhas `#e6e6e6` (`--gainsboro`). Tons escuros de faixas e rodapé: `#2b2727` (`--black--50`) e `#403939` (`--black-2`).
   - fonte dos títulos e do texto: **Gilroy** (a mesma para títulos e texto). Os arquivos da fonte ficam no próprio site;
     **não é do Google Fonts** e é uma fonte paga. Em `tema.css` ela aparece em primeiro lugar; quem não tem a Gilroy
     no computador vê a Inter (a fonte que já carregava).
     Extra: o site usa Great Vibes (Google Fonts) só numa assinatura decorativa — não serve para o painel.
3. Passar os valores para `css/tema.css` (`--ac`, `--ac-tx`, `--fonte` etc.). Não mexer em mais nenhum arquivo.
4. Conferir se o texto continua legível (contraste) nos botões, nas barras e nos selos de prazo.

## Logo
- Logo: https://cdn.prod.website-files.com/66a7787b7ed36b45613c93d2/66a77c30b026b236017d8485_logo-supertex.png
- Favicon: https://cdn.prod.website-files.com/66a7787b7ed36b45613c93d2/66a7792423dc1441d2f7bf88_favicon-supertex.png

Esta página é uma ferramenta **interna da Senger** para acompanhar o fornecedor. Usar as cores para identificar
que o painel é da obra com a Supertex, mas sem dar a entender que a página é da própria Supertex.

## Dados da empresa (do site)
- Concreto usinado, argamassa estabilizada, bombeamento, areia e brita.
- Frota própria com mais de 150 betoneiras e rastreamento 24h.
- Unidades no RS incluem Carazinho e Passo Fundo (o acordo da obra do hotel é carregar **sempre por Carazinho**).
- Telefone: 0800 000 8484.
