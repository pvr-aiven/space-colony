BACKEND_DIR := backend
FRONTEND_DIR := frontend

LOCAL_PG_CONTAINER := space-colony-pg-dev
LOCAL_PG_PORT := 55432

# Defaults for seed-prod — only used if not passed on the command line.
PGPORT ?= 5432

.PHONY: help \
	seed-prod \
	install install-backend install-frontend \
	local-db local-db-down local-migrate local-reset \
	dev-backend dev-frontend

help:
	@echo "Aiven demo — common tasks:"
	@echo ""
	@echo "  Against a real Aiven for PostgreSQL service (created manually in the"
	@echo "  Aiven console or via Aiven Runtime's own service composer — no Terraform):"
	@echo "    make seed-prod PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=... [PGPORT=5432]"
	@echo "                        apply db/init.sql + db/seed.sql to that service"
	@echo ""
	@echo "  Local development (no Aiven account needed):"
	@echo "    make install        npm install for backend + frontend"
	@echo "    make local-db       start a local Postgres in Docker"
	@echo "    make local-migrate  apply db/init.sql + db/seed.sql to the local Postgres"
	@echo "    make local-reset    local-db-down + local-db + local-migrate"
	@echo "    make dev-backend    run the backend against the local Postgres (npm run dev)"
	@echo "    make dev-frontend   run the Vite dev server"
	@echo "    make local-db-down  stop and remove the local Postgres container"

# ---- Real Aiven for PostgreSQL service ----------------------------------

# Run as the service admin (e.g. avnadmin), not an app-specific user —
# Postgres 15+ revokes CREATE on schema public by default, so only the
# admin (who ends up owning the tables it creates) has rights on them
# until db/init.sql's GRANT block hands out any further access itself.
seed-prod:
	@if [ -z "$(PGHOST)" ] || [ -z "$(PGUSER)" ] || [ -z "$(PGPASSWORD)" ] || [ -z "$(PGDATABASE)" ]; then \
		echo "Usage: make seed-prod PGHOST=<host> PGUSER=<user> PGPASSWORD=<password> PGDATABASE=<database> [PGPORT=5432]"; \
		exit 1; \
	fi
	cd $(BACKEND_DIR) && \
	PGHOST=$(PGHOST) PGPORT=$(PGPORT) PGUSER=$(PGUSER) PGPASSWORD=$(PGPASSWORD) PGDATABASE=$(PGDATABASE) \
	npm run migrate

# ---- Local development --------------------------------------------------

install: install-backend install-frontend

install-backend:
	cd $(BACKEND_DIR) && npm install

install-frontend:
	cd $(FRONTEND_DIR) && npm install

local-db:
	docker run -d --name $(LOCAL_PG_CONTAINER) \
		-e POSTGRES_PASSWORD=local \
		-e POSTGRES_DB=space_colony \
		-p $(LOCAL_PG_PORT):5432 \
		postgres:18-alpine
	@echo "waiting for postgres..."
	@until docker exec $(LOCAL_PG_CONTAINER) pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

local-db-down:
	docker rm -f $(LOCAL_PG_CONTAINER) || true

local-migrate:
	cd $(BACKEND_DIR) && \
	PGHOST=localhost PGPORT=$(LOCAL_PG_PORT) PGUSER=postgres PGPASSWORD=local \
	PGDATABASE=space_colony PGSSLMODE=disable npm run migrate

local-reset: local-db-down local-db local-migrate

dev-backend:
	cd $(BACKEND_DIR) && \
	PGHOST=localhost PGPORT=$(LOCAL_PG_PORT) PGUSER=postgres PGPASSWORD=local \
	PGDATABASE=space_colony PGSSLMODE=disable PORT=3000 npm run dev

dev-frontend:
	cd $(FRONTEND_DIR) && npm run dev
