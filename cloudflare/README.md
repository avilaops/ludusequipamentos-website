# Cloudflare Pages

## Descoberta pública • ARD e WebMCP

Depois de `npm run text:static`, o workflow usa o mesmo pacote central para
gerar a descoberta sobre `dist`, o diretório enviado ao Pages:

```sh
node node_modules/@avilaops/publicacao-texto/bin/publicar-descoberta.mjs --diretorio dist --origem https://ludusequipamentos.com --excluir-prefixo /core/ --excluir-prefixo /loja/
```

Os prefixos excluídos acompanham o contrato do wrapper textual existente:
o catálogo e os produtos são resolvidos pelo Worker e pela publicação atual do R2.
Páginas sob `/core/` e `/loja/` não entram no catálogo estático nem recebem
injeção WebMCP do gerador. Isso evita anunciar produtos do build que possam ter
sido retirados. Não se relaxam filtros de publicação ou a conversão dinâmica.

Nas demais páginas públicas e indexáveis, o gerador central emite
`/.well-known/ard.json`, `/ai-catalog.json`, o link `rel="ard"` e o adaptador
leve de leitura do DOM e links públicos. Ele não envia formulários nem executa
transações. Browsers sem a API preservam o comportamento existente, sem polyfill.
Não há biblioteca de cliente duplicada neste repositório.

A dependência `@avilaops/publicacao-texto` e o lockfile usam o commit revisado
`d5067bbbe3522f459367af3b58b4298324801f82`, com o CLI e as exclusões de prefixo.
O CI deve validar o bundle do Worker,
o site, os testes existentes, as versões textuais e a descoberta. Nenhum desses
builds ou testes foi executado localmente nesta preparação.

Confira JSON/recursos anunciados, ausência de catálogo antigo e áreas privadas,
HTML público preservado e funcionamento com e sem WebMCP. Mantenha os checks,
retries, saídas, condição de deploy em pull requests, bindings, R2 e publicação
separada do Worker. Não alterar DNS, robots, consentimento ou medição.
Para rollback, restaure juntos o workflow, a dependência e o lockfile anteriores
e publique o artefato Pages compatível; não reverta a publicação atual do R2.

Projeto: `ludusequipamentos`. Saída pública: `dist`. Fonte: este repositório.

O workflow `.github/workflows/cloudflare-pages.yml` publica cada push na main. O segredo `CLOUDFLARE_API_TOKEN` tem somente acesso ao Pages da conta Avila Ops.

Domínios e redirecionamento de www são configurados na zona Cloudflare. Não alterar MX, TXT nem subdomínios de outros aplicativos.

O Worker `ludus-catalog-media` e o R2 continuam responsáveis por fotos, PDFs e catálogo. Preserve o segredo PUBLISH_TOKEN ao publicar o gateway.

## MDX e Markdown • páginas estáticas e catálogo publicado

O mesmo pacote público `@avilaops/publicacao-texto`, do repositório
[avilaops/motor-web](https://github.com/avilaops/motor-web), é usado na geração
estática e no Worker. O SHA completo está fixado em `package.json` e no lockfile.

• `npm run text:static` roda depois do build. Usa o motor do CLI para gerar os
arquivos, manifesto, `llms.txt` e cabeçalhos das páginas estáticas em `dist`.
Durante a geração, regras temporárias excluem `/core/*` e `/loja/*`; o bloco é
retirado em `finally`, preservando os cabeçalhos manuais e a indexação HTML.
O próprio motor remove cópias antigas de catálogo que reconhece como geradas.

• No domínio público, `/core/<slug>/index.md`, `/loja/<slug>/index.mdx` e as
variantes das coleções passam pelo Worker. Ele resolve primeiro o mesmo HTML
público, incluindo a publicação atual do R2 e a reescrita dos campos. Depois
converte a resposta. O HTML do catálogo anuncia os dois links alternativos.
O manifesto e o índice estáticos não anunciam cópias de catálogo do build.

• Retirada de produto retorna 404 também no texto. Atualizações entram na
próxima requisição. Noindex, erros, autenticação da origem e redirecionamentos
impedem a conversão. Canonical de outro host ou produto também é recusado.
Redirects e autenticação retornam 404, sem Location, desafio ou corpo da origem;
404 de remoção e 5xx permanecem, sem corpo e com no-store.
R2 sem publicação conserva o fallback HTML existente;
erro de leitura conserva o erro do HTML. Nunca há fallback para MDX antigo.

• A leitura HTML usa URL pública fixa e GET anônimo; não envia Cookie,
Authorization, Range ou condicionais do visitante. URLs textuais com query
são recusadas. O corpo HTML é limitado a 2 MB. MDX/Markdown saem com MIME
próprio, `noindex`, `nosniff` e cache privado sujeito a revalidação. O ETag
inclui tenant, rota, formato e conteúdo, e só é comparado depois de conferir
a publicação e o HTML atuais, inclusive em HEAD.
O cabeçalho Link aponta para o HTML canônico e para `llms.txt`, inclusive em
HEAD e 304.

• `npm run build:catalog-worker` cria `.worker-build/catalog-media.mjs`.
Os testes Miniflare usam o mesmo bundle, com R2 local e Pages simulado.
O CI valida o bundle, o site, os testes e a geração estática; PR não publica.

A publicação do Worker `ludus-catalog-media` é uma ação separada e revisada.
Antes de liberar estas URLs, publique o bundle aprovado preservando os mesmos
bindings, compatibilidade, rotas, R2 e segredos existentes. Depois publique o
artefato Pages aprovado e confira as URLs no domínio público. Este workflow
continua publicando somente Pages; não muda ERP, R2, servidor ou backend.
Para rollback, restaure a versão anterior do Worker e o deploy Pages compatível.
