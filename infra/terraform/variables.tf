variable "aiven_api_token" {
  description = "Aiven API token (export TF_VAR_aiven_api_token instead of committing it)"
  type        = string
  sensitive   = true
}

variable "aiven_project" {
  description = "Aiven project name the service is created in"
  type        = string
}

variable "cloud_name" {
  description = "Aiven cloud/region, e.g. google-europe-west3"
  type        = string
  default     = "google-europe-west3"
}

variable "plan" {
  description = "Aiven for PostgreSQL service plan"
  type        = string
  default     = "startup-4"
}

variable "service_name" {
  description = "Name of the Aiven for PostgreSQL service"
  type        = string
  default     = "space-colony-pg"
}

variable "database_name" {
  description = "Name of the game database"
  type        = string
  default     = "space_colony"
}

variable "pg_version" {
  description = "PostgreSQL major version"
  type        = string
  default     = "18"
}
