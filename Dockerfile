# Savings & Retirement Withdrawal Calculator — static web container
# Serves the self-contained calculator via nginx on port 80.
FROM nginx:1.27-alpine

# Application files (Chart.js is vendored locally in /lib, so no internet needed at runtime)
COPY Retirement-Withdrawal-Calculator.html /usr/share/nginx/html/index.html
COPY lib/ /usr/share/nginx/html/lib/

EXPOSE 80

# Custom nginx config so the container also works on non-standard ports
COPY nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
