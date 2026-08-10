# Website Backend Migrations

Run these migrations against the APP operational PostgreSQL database.

The current runtime still uses SQLAlchemy `create_all()` plus a few compatibility
column patches for the original MVP tables. New production schema changes should
live here and be applied explicitly during deployment.

Do not commit database URLs or credentials.

Example:

```bash
psql "$DATABASE_URL" -f Website/backend/migrations/20260810_expand_operational_schema.sql
```
