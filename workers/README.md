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
