# Cloudflare Pages

Projeto: `ludusequipamentos`. Saída pública: `dist`. Fonte: este repositório.

O workflow `.github/workflows/cloudflare-pages.yml` publica cada push na main. O segredo `CLOUDFLARE_API_TOKEN` tem somente acesso ao Pages da conta Avila Ops.

Domínios e redirecionamento de www são configurados na zona Cloudflare. Não alterar MX, TXT nem subdomínios de outros aplicativos.

O Worker `ludus-catalog-media` e o R2 continuam responsáveis por fotos, PDFs e catálogo. Preserve o segredo PUBLISH_TOKEN ao publicar o gateway.

## MDX e Markdown na publicação

O workflow gera as versões textuais depois do build e da preparação de `dist`,
antes de `Publish Pages`. O publicador usa o repositório público
[avilaops/motor-web](https://github.com/avilaops/motor-web/tree/02fe995339970e77ba86505488451f8c67bdddc7)
fixado no commit `02fe995339970e77ba86505488451f8c67bdddc7`. Suas dependências de produção
são instaladas em `.publicacao-texto` com scripts de instalação desativados.

```sh
node .publicacao-texto/bin/publicar-texto.mjs --diretorio dist --origem https://ludusequipamentos.com
```

O mesmo artefato recebe `.md`, `.mdx`, `publicacao-texto.json`, os links de descoberta,
a seção gerada em `llms.txt` e os cabeçalhos das cópias textuais em `_headers`.
O conversor exclui rotas privadas, páginas de erro e conteúdo `noindex` ou `none`.
Arquivos manuais são preservados; um shell sem conteúdo renderizado faz a geração
falhar e impede a etapa de publicação.

Pull requests executam o build e a geração. A condição existente de `Publish Pages`
continua impedindo deploy em eventos `pull_request`. Para atualizar o publicador,
altere o commit fixado no workflow e valide o novo manifesto em CI.
Para rollback, restaure o workflow anterior e use o artefato ou deploy anterior
conforme o fluxo de publicação do projeto.
