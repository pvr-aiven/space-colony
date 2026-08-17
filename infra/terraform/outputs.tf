output "pg_host" {
  value = aiven_pg.game_db.service_host
}

output "pg_port" {
  value = aiven_pg.game_db.service_port
}

output "pg_database" {
  value = aiven_pg_database.game_db.database_name
}

output "pg_user" {
  value = aiven_pg_user.app_runtime.username
}

output "pg_password" {
  value     = aiven_pg_user.app_runtime.password
  sensitive = true
}

output "pg_admin_user" {
  # The service's default superuser (avnadmin) — owns every object created by
  # db/init.sql, so migrations must run as this user, not app_runtime.
  value = aiven_pg.game_db.service_username
}

output "pg_admin_password" {
  value     = aiven_pg.game_db.service_password
  sensitive = true
}

output "pg_ca_cert" {
  value     = data.aiven_project.this.ca_cert
  sensitive = true
}

# Convenience: a ready-to-use connection string for local testing / psql.
# Not meant to be pasted into Aiven Runtime env vars directly — prefer the
# console's "Connect service" integration, which injects PG* vars itself.
output "psql_uri" {
  value     = "postgres://${aiven_pg_user.app_runtime.username}:${aiven_pg_user.app_runtime.password}@${aiven_pg.game_db.service_host}:${aiven_pg.game_db.service_port}/${aiven_pg_database.game_db.database_name}?sslmode=require"
  sensitive = true
}
