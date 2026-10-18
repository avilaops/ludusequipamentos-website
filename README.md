# Site da Ludus Equipamentos

Site institucional, loja (catálogo por orçamento) e simulador "Monte sua academia".
Publicado em https://ludusequipamentos.com. Os endereços antigos (ludus.avilaops.com, www e ludusequipamentos.com.br) redirecionam para ele.

| Rota | O que é |
| --- | --- |
| `/` | Institucional: proposta, linhas, simulador, como funciona, contato |
| `/loja/` | Os 91 equipamentos publicados, com busca e filtros por linha e grupo muscular (refletidos na URL) |
| `/loja/<slug>/` | Página do equipamento: foto, ficha, planta, cores, relacionados, WhatsApp. Endereço permanente (alvo do QR do catálogo) |
| `/kits/` e `/kits/<id>/` | Academias de 150, 300 e 600 m² com planta e lista |
| `/simulador/` | Planta em escala com arrastar, giro livre e encaixe, obstáculos, sugestão de layout, edição no 3D, projetos salvos, PDF e PNG, link compartilhável e pedido de orçamento |

Links antigos do QR (`/?id=LD-B004`) redirecionam para a página do equipamento.

## Comandos

| O quê | Comando |
| --- | --- |
| Desenvolvimento | `npm run dev` |
| Build estático em `dist/` | `npm run build` |
| Checagem de tipos | `npm run check` |
| Publicar | `npm run deploy` |

## De onde vêm os dados

- `src/data/produtos.json`: catálogo-fonte com 94 produtos (código, nome, linha, grupo, medidas, peso, bateria, descrição, slug). A exportação pública em `src/data/site.ts` oculta os itens fora do escopo do cliente. O slug não muda depois de impresso no catálogo.
- `src/assets/produtos/<código>.jpg`: fotos do catálogo.
- `src/data/site.ts`: dados públicos confirmados da empresa, linhas, cores e o Kit Studio. Informações ainda não fornecidas pela Ludus não são exibidas.
- Modelos 3D, plantas e silhuetas: pacote `@avilaops/gerador-3d` (repositório `avilaops/gerador-3d`), fixado por commit no `package.json`. Para atualizar os modelos, troque o commit e rode `npm install`.

## Stack

Astro (saída estática), TypeScript, Three.js via gerador 3D, fontes Barlow e Barlow Condensed hospedadas junto. Sem backend: o contato é por WhatsApp e e-mail.

## Configuração por variável de ambiente (no build)

| Variável | Para quê |
| --- | --- |
| `PUBLIC_GTM_ID` | ID do Google Tag Manager. Sem ele nada de medição é carregado e o aviso de cookies não aparece. Os eventos (`clique_whatsapp`, `interacao_3d`, `visita_qr`, `envio_formulario`, `abrir_ar`) já vão para `window.dataLayer`. |
| `PUBLIC_LEAD_ENDPOINT` | Endereço que recebe o formulário (multipart, com a planta). Sem ele o formulário abre o WhatsApp com os dados preenchidos. |
| `PUBLIC_INDEXAR=0` | Coloca noindex em todas as páginas (para ambientes de teste). Sem a variável, o site é indexado. |
| `SITE_URL` | Endereço público usado em canonical, og:url e sitemap. Padrão: `https://ludusequipamentos.com`. |

Os arquivos de AR (`public/modelos/*.glb` e `*.usdz`) saem do gerador com `npm run modelos` e não ficam no git.

## Publicação automática

O workflow `.github/workflows/ci.yml` checa e faz o build a cada push. Ele publica sozinho se o repositório tiver o segredo `DEPLOY_SSH_KEY`; sem o segredo, a publicação é manual (`npm run deploy`).

## Pendências conhecidas

- Destino dos leads do formulário (`PUBLIC_LEAD_ENDPOINT`) e ID do Tag Manager.
- AR não testado em aparelho real.
- Kits de 300 e 600 m² são composição sugerida, a validar com a Ludus.
- Cadastrar ludusequipamentos.com no Search Console e enviar o sitemap.
