TF_DIR := infra/terraform
BACKEND_DIR := backend
FRONTEND_DIR := frontend

LOCAL_PG_CONTAINER := space-colony-pg-dev
LOCAL_PG_PORT := 55432

.PHONY: help \
	tf-init tf-plan tf-apply tf-output tf-destroy \
	migrate init \
	install install-backend install-frontend \
	local-db local-db-down local-migrate local-reset \
	dev-backend dev-frontend

help:
	@echo "Aiven demo — common tasks:"
	@echo ""
	@echo "  Real Aiven infra (needs TF_VAR_aiven_api_token and TF_VAR_aiven_project):"
	@echo "    make tf-init      terraform init"
	@echo "    make tf-plan      terraform plan"
	@echo "    make tf-apply     terraform apply"
	@echo "    make tf-output    print all terraform outputs (secrets included)"
	@echo "    make migrate      apply db/init.sql + db/seed.sql to the real Aiven PG service"
	@echo "    make init         tf-init + tf-apply + migrate, in one shot"
	@echo "    make tf-destroy   tear down the Aiven PG service"
	@echo ""
	@echo "  Local development (no Aiven account needed):"
	@echo "    make install        npm install for backend + frontend"
	@echo "    make local-db       start a local Postgres in Docker"
	@echo "    make local-migrate  apply db/init.sql + db/seed.sql to the local Postgres"
	@echo "    make local-reset    local-db-down + local-db + local-migrate"
	@echo "    make dev-backend    run the backend against the local Postgres (npm run dev)"
	@echo "    make dev-frontend   run the Vite dev server"
	@echo "    make local-db-down  stop and remove the local Postgres container"

# ---- Real Aiven infra -------------------------------------------------

tf-init:
	terraform -chdir=$(TF_DIR) init

tf-plan:
	terraform -chdir=$(TF_DIR) plan

tf-apply:
	terraform -chdir=$(TF_DIR) apply

tf-output:
	terraform -chdir=$(TF_DIR) output

tf-destroy:
	terraform -chdir=$(TF_DIR) destroy

# Runs as the service admin (avnadmin), not app_runtime — db/init.sql grants
# app_runtime its runtime privileges once the tables exist, and only the
# admin user can create objects in schema public on Postgres 15+.
migrate:
	cd $(BACKEND_DIR) && \
	PGHOST=$$(terraform -chdir=../$(TF_DIR) output -raw pg_host) \
	PGPORT=$$(terraform -chdir=../$(TF_DIR) output -raw pg_port) \
	PGDATABASE=$$(terraform -chdir=../$(TF_DIR) output -raw pg_database) \
	PGUSER=$$(terraform -chdir=../$(TF_DIR) output -raw pg_admin_user) \
	PGPASSWORD=$$(terraform -chdir=../$(TF_DIR) output -raw pg_admin_password) \
	npm run migrate

init: tf-init tf-apply migrate
	@echo "Aiven for PostgreSQL is provisioned and the schema is applied."
	@echo "Next: deploy the backend on Aiven Runtime from the console (see backend/README.md)."

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
