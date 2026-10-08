# Site da Ludus Equipamentos

Site institucional, loja (catálogo por orçamento) e simulador "Monte sua academia".
Publicado em https://ludus.avilaops.com enquanto o domínio da Ludus não aponta para cá (marcado como noindex).

| Rota | O que é |
| --- | --- |
| `/` | Institucional: proposta, linhas, simulador, 3D, como funciona, contato |
| `/loja/` | Os 94 equipamentos, com busca e filtros por linha e grupo muscular (refletidos na URL) |
| `/loja/<slug>/` | Página do equipamento: foto, 3D, ficha, planta, cores, relacionados, WhatsApp. Endereço permanente (alvo do QR do catálogo) |
| `/simulador/` | Planta em escala com arrastar e girar, visão 3D da sala, link compartilhável e pedido de orçamento |

Links antigos do QR (`/?id=LD-B004`) redirecionam para a página do equipamento.

## Comandos

| O quê | Comando |
| --- | --- |
| Desenvolvimento | `npm run dev` |
| Build estático em `dist/` | `npm run build` |
| Checagem de tipos | `npm run check` |
| Publicar | `npm run deploy` |

## De onde vêm os dados

- `src/data/produtos.json`: os 94 produtos (código, nome, linha, grupo, medidas, peso, bateria, descrição, slug). O slug não muda depois de impresso no catálogo.
- `src/assets/produtos/<código>.jpg`: fotos do catálogo.
- `src/data/site.ts`: dados da empresa, linhas, cores e o Kit Studio. O que a Ludus ainda não informou (CNPJ, endereço, garantia, prazo, pagamento) fica `null` e aparece no site como "a confirmar". Nada disso é inventado.
- Modelos 3D, plantas e silhuetas: pacote `@avilaops/gerador-3d` (repositório `avilaops/gerador-3d`), fixado por commit no `package.json`. Para atualizar os modelos, troque o commit e rode `npm install`.

## Stack

Astro (saída estática), TypeScript, Three.js via gerador 3D, fontes Barlow e Barlow Condensed hospedadas junto. Sem backend: o contato é por WhatsApp e e-mail.

## Pendências conhecidas

- Formulário com envio de planta, analytics (GA4, Pixel) e consentimento de cookies.
- `sitemap.xml` e remoção do noindex quando o domínio definitivo entrar.
- Dados "a confirmar" da Ludus.
