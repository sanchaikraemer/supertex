# Acompanhamento da Concreteira (Supertex)

## O que é
Página que lê a conversa **exportada do WhatsApp** do grupo da obra com a concreteira Supertex (.zip ou .txt)
e monta um relatório: cargas, m³, notas fiscais, caminhões (BT), espera entre pedido e saída, cancelamentos,
chuva, reclamações e atrasos. Tudo roda no navegador, sem servidor e sem login. Abrir `index.html` já funciona.

## Quem usa
Sanchai (comercial da Construtora Senger). **Não é programador.** Explique tudo em português simples, sem termos técnicos.

## REGRAS DE TRABALHO (obrigatórias)
1. Fazer **somente** o que foi pedido. Não mudar, melhorar, reorganizar ou "aproveitar para arrumar" nada além.
2. Se achar que algo mais deveria ser feito, **só avisar no final**, sem fazer.
3. Se o pedido não estiver claro, **perguntar antes**.
4. No final de cada tarefa, **listar exatamente o que foi alterado** (arquivo e o que mudou).
5. Nunca colocar conversas reais, telefones ou nomes de pessoas no repositório: ele é **público**.
   Conversas para teste ficam em `exemplos/`, que está no `.gitignore`.

## Arquivos
- `index.html` — estrutura da página (não tem cores nem lógica).
- `css/tema.css` — **único lugar com cores e fonte** (identidade visual Supertex).
- `css/estilo.css` — layout e componentes. Só usa `var(--...)` do tema; nunca cor fixa.
- `js/analise.js` — lê o texto exportado e identifica mensagens, pedidos, cargas, cancelamentos e ocorrências.
- `js/tela.js` — upload (.zip/.txt), filtros e montagem das abas do relatório.
- `identidade/IDENTIDADE_SUPERTEX.md` — referência da marca.
- `exemplos/` — conversas reais para teste (fora do Git).

## Versão
O número da versão aparece sempre no topo da página (`index.html`, no subtítulo do cabeçalho: `versão 0013`).
**Toda vez que uma mudança for colocada no link, aumentar 1** (0003 → 0004 → 0005...), sempre com 4 dígitos.
O link do manifesto no `index.html` leva o mesmo número (`manifest.webmanifest?v=0013`), para o celular nunca pegar a ficha antiga do app.

## Como a leitura funciona (js/analise.js)
- Mensagem nova = linha que começa com `dd/mm/aaaa hh:mm - Nome: texto`. Linhas seguintes continuam a mesma mensagem.
- **Lado da obra**: quem tem no nome um dos termos do campo "Quem é da obra" (padrão: `Senger, Sanchai, Você`). O resto é concreteira.
- **Carga** (vem da concreteira) neste formato:
  ```
  3⁰
  BT 233
  Saindo as 14:28
  6m
  NF 83395
  ```
- **Pedido** (vem da obra): mensagem com volume (`6 metros`, `6 MT`, `6m`) e palavra como carrega/manda/caminhão/outro.
  `2 caminhão de 6 MT cada` vira 2 pedidos. "Carrega com X metros" até 60 min depois de um pedido ainda não atendido corrige o volume desse pedido.
- Cada carga é ligada ao pedido mais antigo do mesmo dia ainda não atendido. **Espera = saída do caminhão − hora do pedido.**
- Cancelar, segurar, "não vamos mais", "por hj fechou" ou "vamos parar" (vindo da obra) cancela os pedidos pendentes do dia.
- Ocorrências: mensagens com palavras como cancel, chuva, atraso, problema, difícil, Passo Fundo/PF, contrato, manutenção, molhado.
- NF muito abaixo da maior NF anterior fica marcada como "conferir" (provável erro de digitação).
- Regra do contrato "carga mínima" (m³ mínimo e taxa por m³ faltante): digitada na página e guardada **só no aparelho**
  (localStorage). **Nunca colocar valores do contrato no repositório** (é público). Marca "falta X" na aba Cargas, soma nos números e no relatório.
  Preços do concreto por fck (campo "fck:preço, fck:preço"): o Relatório mostra o valor estimado (m³ × preço + taxa)
  para cada fck e para o preço médio entre eles, e os números mostram o valor médio do m³. Também só no aparelho.
  Aba **Custos** (enxuta, a pedido do Sanchai): uma linha com o resultado da obra (m³, cargas abaixo do mínimo, m³ que faltou,
  taxa), uma linha com a regra, tabela do valor da obra por fck (R$/m³, total com taxa, m³ sai por) e o simulador
  (volume + caminhões) — tudo calculado com os valores salvos no aparelho.
  Sem os valores, a aba Custos diz o que falta e tem um campo para **colar o link de configuração** (botão Aplicar).
  Tudo pode ser salvo por um **link de configuração**: endereço do app terminado em `#carga=X&taxa=Y&fck=F:P,F:P`
  (o Sanchai manda esse link à equipe pelo WhatsApp; o link com os valores **não** vai para o repositório).
- Fotos não são lidas; aparecem nas Ocorrências como "ouvir/ver no celular".
- Áudios: se a conversa foi exportada **com mídia** (.zip) e há chave da OpenAI salva na página (campo "Transcrição dos áudios",
  guardada só no aparelho, **nunca no repositório**), `js/tela.js` transcreve sozinho e mostra o texto nas Ocorrências.
  O texto transcrito **não entra** no cálculo do relatório (decisão do Sanchai).
- Como a conversa entra: arrastar/escolher o .zip, ou os arquivos extraídos juntos (.txt + áudios), ou
  **compartilhar direto do WhatsApp** para o app instalado no Android ("share_target" no `manifest.webmanifest`;
  o `sw.js` recebe em `./compartilhar` e abre a página com `?compartilhado=1`).

## Teste de referência
Com `exemplos/hotel-senger.txt` (grupo O.STEX - CRZ | HOTEL - SENGER, de 03/11 a 19/11/2026) o resultado tem que ser:
227 m³, 36 cargas, 10 dias com concretagem, espera média de 52 min, 9 cargas acima de 60 min, maior espera de 2h02 (03/11),
2 pedidos não enviados (12/11 09:10 e 13/11 13:42) e a NF 83468 marcada para conferir.
Se mexer em `analise.js`, confira que esses números continuam iguais.

## Primeira tarefa pendente
Puxar as cores e a fonte reais de https://supertex.com.br e preencher `css/tema.css`
(ver `identidade/IDENTIDADE_SUPERTEX.md`). As cores de agora são provisórias.
