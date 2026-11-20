# Mídias e catálogo da Ludus

Worker para `ludusequipamentos.com/*`, com binding R2 `MEDIA` no bucket privado `ludus-equipamentos-midias` e segredo `PUBLISH_TOKEN` compartilhado somente com a API do ERP.

O manifesto existente controla os SKUs e os derivados permitidos. Os originais exigem autenticação; a publicação aceita somente campos comerciais públicos, sem preços. Cada edição é arquivada e a versão corrente usa escrita condicional. O ERP deve enviar uma sequência crescente e repetir o mesmo ID após falha de rede.

## Ativação coordenada

1. Validar testes, build e revisão visual.
2. Implantar Worker e segredo sem ativar a rota pública.
3. Aplicar a migração e cadastrar os perfis dos produtos no ERP, preservando preços e mídias.
4. Configurar a API, publicar a primeira versão revisada e conferir autenticação, imagens, PDFs e metadados.
5. Publicar o site e ativar a rota do Worker no domínio real, com proxy Cloudflare.
6. Conferir no navegador as duas linhas, filtros, fichas e orçamento.

Não ativar as referências `/midias/` sem o Worker e a primeira publicação disponíveis. Não apagar o espelho de recuperação antes da validação de download e hash no R2. Upload de novas versões e regeneração dos PDFs ainda exigem o fluxo avx-tools; esta implementação seleciona variantes já registradas.

## Linha Cardio

O Worker reconhece a coleção `cardio` (URLs `/cardio/<código>/` e `/loja/cardio/`, imagens em `cardio/<código>/…`). Ele foi feito para dois estados:

- **Cardio fora da publicação** (hoje): `/loja/cardio/` e `/cardio/<código>/` passam para as páginas estáticas do site, o contador do Cardio fica com o número do build e o restante do catálogo não muda. As fotos saem do próprio site (`public/fotos-cardio/`).
- **Cardio publicado**: o Worker passa a montar a coleção a partir da publicação, serve `/midias/produtos/<código>` e rotula as fichas como "Ludus Cardio". Nesse caso, trocar `fotoCardio` em `src/data/cardio.ts` para `/midias/produtos/<código>`.

Para ativar, nesta ordem:

1. **Implantar o código do Worker.** Rode `CLOUDFLARE_TOKEN=… node scripts/implantar-worker.mjs` (ensaio: compara o pacote com o Worker implantado e não grava) e, se o diff for só o do Cardio, repita com `--aplicar`. O script usa a API "Replace Worker Script Content", que troca só o código e não mexe em bindings nem no segredo `PUBLISH_TOKEN`. Sem isso, o site novo faria `/loja/cardio/` responder 404 e mostraria o contador do Cardio como 0.
2. **Publicar o site** (`npm run deploy`), só depois do passo 1.
3. **Levar as fotos ao R2 (opcional, para ficar igual ao Core e à Premium).** Cadastrar os 28 SKUs no manifesto, enviar `web.webp` de cada um por `/midias/_upload/…` e publicar por `/midias/_publish` com `colecao: "cardio"` e `url: "/cardio/<código>/"`. Exige o `PUBLISH_TOKEN`.

O ERP hoje cadastra esses itens como coleção `premium`. Para o Cardio não ser sobrescrito como Premium numa próxima publicação do ERP, a coleção do ERP precisa passar a ser `cardio`.
