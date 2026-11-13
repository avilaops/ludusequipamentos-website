# Cloudflare Pages

Projeto: `ludusequipamentos`. Saída pública: `dist`. Fonte: este repositório.

O workflow `.github/workflows/cloudflare-pages.yml` publica cada push na main. O segredo `CLOUDFLARE_API_TOKEN` tem somente acesso ao Pages da conta Avila Ops.

Domínios e redirecionamento de www são configurados na zona Cloudflare. Não alterar MX, TXT nem subdomínios de outros aplicativos.

O Worker `ludus-catalog-media` e o R2 continuam responsáveis por fotos, PDFs e catálogo. Preserve o segredo PUBLISH_TOKEN ao publicar o gateway.
