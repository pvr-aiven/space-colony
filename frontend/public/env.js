// Local-dev default. In the production image, docker-entrypoint.sh
// overwrites this file at container startup with the real API_URL.
window.__ENV__ = { API_URL: "" };
