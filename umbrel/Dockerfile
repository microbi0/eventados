# Recolha diária do Eventados a partir de casa (Umbrel).
# Alguns sites (AgendaLX, TNSJ) estão atrás da Cloudflare e bloqueiam pedidos de centros de dados,
# por isso a recolha corre aqui e os dados são enviados para o GitHub, que publica o site.
FROM node:22-alpine
RUN apk add --no-cache git openssh-client tzdata
ENV TZ=Europe/Lisbon
COPY run.sh /usr/local/bin/eventados-sync
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/eventados-sync
# crond do busybox em primeiro plano; o registo de cada execução fica em /data/logs.
CMD ["crond", "-f", "-l", "6"]
