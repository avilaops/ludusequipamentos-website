# Site da Ludus Equipamentos

Site institucional, loja (catálogo por orçamento) e simulador "Monte sua academia".
Publicado em https://ludusequipamentos.com. Os endereços antigos (ludus.avilaops.com, www e ludusequipamentos.com.br) redirecionam para ele.

| Rota | O que é |
| --- | --- |
| `/` | Institucional: proposta, linhas, simulador, como funciona, contato |
| `/loja/` | Todos os 157 equipamentos, com seleção entre Core e Premium |
| `/loja/premium/` | 91 equipamentos Premium, com busca e filtros por categoria e grupo muscular |
| `/loja/core/` | 66 equipamentos Core, com busca e filtros por grupo corporal; sem preços |
| `/loja/<slug>/` | Página do equipamento: foto, ficha, planta, cores, relacionados, WhatsApp. Endereço permanente (alvo do QR do catálogo) |
| `/core/` | Compatibilidade: encaminha à coleção `/loja/core/`, preservando busca, grupo e âncora |
| `/core/ld-wh001/` a `/core/ld-wh066/` | Fichas nacionais com foto, medidas em mm, área nominal, planta dimensional esquemática e orçamento. URLs permanentes para o catálogo |
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

- O catálogo Premium para download fica em `public/catalogos/ludus-premium.pdf`, gerado pela skill `criar-catalogo` do avx-tools com 91 produtos, sem preços. A fonte e os relatórios de conferência ficam no projeto local do catálogo: `premium/manifesto.json` e `outputs/ludus-premium/`.
- As três telas de loja compartilham `CatalogoLoja.astro`. Na visão geral os produtos das duas coleções se alternam; os cartões identificam sua coleção. Nomes equivalentes de grupo são normalizados apenas para navegação, preservando dados técnicos de origem.

- Não há banco de servidor neste site estático. `src/data/catalogo.ts` unifica os dois arquivos de produtos através do campo tipado `colecao: 'premium' | 'core'`. Os carregadores identificam a coleção pela fonte, preservando os JSONs originais e mantendo `linha` como categoria técnica da Premium. `selecionarColecao` atende seleção de uma coleção ou das duas.
- As fichas `/loja/<slug>/` e `/core/<codigo>/` permanecem nos endereços impressos nos QR codes. A mudança de rota se aplica às páginas das coleções.

- `src/data/produtos.json`: catálogo-fonte com 94 produtos (código, nome, linha, grupo, medidas, peso, bateria, descrição, slug). A exportação pública em `src/data/site.ts` oculta os itens fora do escopo do cliente. O slug não muda depois de impresso no catálogo.
- `src/assets/produtos/<código>.jpg`: fotos do catálogo.
- `src/data/core.json`: dados nacionais aprovados, sem preços; dimensões na ordem `[profundidade, largura, altura]`, em mm. Grupos e endereço do PDF em `src/data/core.ts`.
- `src/assets/core/<código>.webp`: 66 fotos nacionais com a marca Ludus. Para reimportar as fotos aprovadas: `node scripts/importar-fotos-core.mjs <pasta-tratadas>`.
- A linha Core tem fichas próprias: não herda cores, modelos 3D nem folgas de circulação da Premium. A área nominal é largura × profundidade.
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
