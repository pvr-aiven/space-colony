data "aiven_project" "this" {
  project = var.aiven_project
}

resource "aiven_pg" "game_db" {
  project      = var.aiven_project
  service_name = var.service_name
  cloud_name   = var.cloud_name
  plan         = var.plan

  pg_user_config {
    pg_version = var.pg_version
  }
}

resource "aiven_pg_database" "game_db" {
  project       = var.aiven_project
  service_name  = aiven_pg.game_db.service_name
  database_name = var.database_name
}

resource "aiven_pg_user" "app_runtime" {
  project      = var.aiven_project
  service_name = aiven_pg.game_db.service_name
  username     = "app_runtime"
}
