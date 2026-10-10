#!/usr/bin/env bash
# Publica o site em https://ludusequipamentos.com (servidor "applications", Caddy, /var/www).
# O build roda aqui; para o servidor só vão os arquivos estáticos.
# Uso: npm run deploy   (precisa do host "applications" no ~/.ssh/config)
set -euo pipefail
HOST="${DEPLOY_HOST:-applications}"
DIR=/var/www/ludus.avilaops.com

[ -d public/modelos ] || bash scripts/modelos.sh
npx astro build
tar -C dist -cf - . | ssh -o BatchMode=yes "$HOST" "mkdir -p $DIR.novo && tar -C $DIR.novo -xf - && rm -rf $DIR && mv $DIR.novo $DIR"
for path in / /loja/ /simulador/; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://ludusequipamentos.com$path")
  echo "https://ludusequipamentos.com$path respondeu $code"
  [ "$code" = 200 ]
done
