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
O número da versão aparece sempre no topo da página (`index.html`, no subtítulo do cabeçalho: `versão 0003`).
**Toda vez que uma mudança for colocada no link, aumentar 1** (0003 → 0004 → 0005...), sempre com 4 dígitos.

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
- Áudios e fotos não são lidos; aparecem nas Ocorrências como "ouvir/ver no celular".

## Teste de referência
Com `exemplos/hotel-senger.txt` (grupo O.STEX - CRZ | HOTEL - SENGER, de 03/11 a 19/11/2026) o resultado tem que ser:
227 m³, 36 cargas, 10 dias com concretagem, espera média de 52 min, 9 cargas acima de 60 min, maior espera de 2h02 (03/11),
2 pedidos não enviados (12/11 09:10 e 13/11 13:42) e a NF 83468 marcada para conferir.
Se mexer em `analise.js`, confira que esses números continuam iguais.

## Primeira tarefa pendente
Puxar as cores e a fonte reais de https://supertex.com.br e preencher `css/tema.css`
(ver `identidade/IDENTIDADE_SUPERTEX.md`). As cores de agora são provisórias.
