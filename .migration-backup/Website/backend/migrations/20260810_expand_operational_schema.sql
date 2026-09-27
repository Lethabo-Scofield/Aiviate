-- Aiviate operational schema expansion.
-- Purpose: move the APP backend from an MVP dispatch schema toward a full
-- last-mile delivery operating system with explicit ownership boundaries for
-- admin, merchant integrations, dispatch, driver app, call agent, safety,
-- future device events and audit.
--
-- Safe to run more than once.
-- Requires the existing `companies` table from Website/backend/models.py.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name TEXT;
  expanded_tables TEXT[] := ARRAY[
    -- tenancy, identity and security
    'company_profiles',
    'company_service_areas',
    'company_operating_hours',
    'company_holidays',
    'company_rate_cards',
    'company_feature_flags',
    'teams',
    'roles',
    'permissions',
    'role_permissions',
    'user_sessions',
    'user_mfa_factors',
    'user_password_resets',
    'service_tokens',
    'api_key_rotations',

    -- driver app and fleet
    'driver_invitations',
    'driver_documents',
    'driver_availability_windows',
    'driver_shift_plans',
    'driver_shift_checkins',
    'driver_certifications',
    'driver_performance_daily',
    'driver_location_updates',
    'driver_device_sessions',
    'driver_route_acknowledgements',
    'vehicles',
    'vehicle_documents',
    'vehicle_maintenance_plans',
    'vehicle_maintenance_events',
    'vehicle_capacity_profiles',
    'vehicle_inspections',

    -- merchant integrations and order ingestion
    'merchant_integrations',
    'merchant_api_keys',
    'merchant_webhooks',
    'merchant_webhook_deliveries',
    'merchant_order_import_batches',
    'merchant_order_import_errors',
    'order_uploads',
    'orders',
    'order_addresses',
    'order_packages',
    'order_items',
    'order_notes',
    'order_status_history',
    'order_validation_results',
    'order_geocode_attempts',
    'address_review_queue',
    'service_area_matches',

    -- dispatch, jobs, routes and stops
    'job_status_history',
    'job_events',
    'stop_status_history',
    'stop_proof_events',
    'stop_failure_reasons',
    'dispatch_batches',
    'dispatch_plans',
    'dispatch_plan_routes',
    'dispatch_plan_stops',
    'dispatch_plan_assignments',
    'dispatch_plan_diffs',
    'dispatch_approvals',
    'driver_assignments',
    'route_change_events',
    'route_change_notifications',
    'live_operation_events',
    'delay_events',

    -- deterministic decision engine adapter state
    'reoptimization_requests',
    'reoptimization_results',
    'decision_engine_requests',
    'decision_engine_responses',
    'decision_engine_explanations',
    'matrix_jobs',
    'geocoding_jobs',
    'confidence_scores',
    'planning_constraints',
    'plan_validation_results',

    -- notifications, alerts and safety
    'alert_deliveries',
    'notification_templates',
    'driver_notifications',
    'customer_notifications',
    'safety_signals',
    'safety_incidents',
    'safety_incident_evidence',
    'safety_policy_decisions',
    'safety_escalation_rules',
    'safety_escalation_runs',

    -- call agent operational persistence
    'call_requests',
    'call_records',
    'call_contexts',
    'call_tool_invocations',
    'call_webhooks',
    'call_webhook_events',
    'call_outcomes',
    'call_transcripts',
    'call_handoffs',
    'call_availability_confirmations',
    'call_reschedule_requests',
    'call_redaction_events',

    -- future device contracts and telemetry intake
    'device_registrations',
    'device_credentials',
    'device_heartbeats',
    'device_safety_events',
    'device_event_deduplication',
    'device_firmware_versions',
    'device_model_versions',
    'device_consent_records',
    'device_health_checks',
    'device_offline_buffers',

    -- platform plumbing
    'integration_outbox_events',
    'integration_inbox_events',
    'idempotency_keys',
    'rate_limit_events',
    'correlation_traces',
    'audit_events',
    'object_assets',
    'upload_scan_results',
    'data_retention_policies',
    'privacy_access_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY expanded_tables LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR REFERENCES companies(id) ON DELETE CASCADE,
        status VARCHAR NOT NULL DEFAULT ''active'',
        external_ref VARCHAR,
        correlation_id VARCHAR,
        source VARCHAR,
        payload JSONB NOT NULL DEFAULT ''{}''::jsonb,
        occurred_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )',
      table_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (company_id, created_at DESC)',
      'idx_' || table_name || '_company_created',
      table_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (correlation_id)',
      'idx_' || table_name || '_correlation',
      table_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I USING GIN (payload)',
      'idx_' || table_name || '_payload',
      table_name
    );
  END LOOP;
END $$;

-- Workflow-specific uniqueness and lookup indexes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_company_external_ref
  ON orders (company_id, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_api_keys_company_external_ref
  ON merchant_api_keys (company_id, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_keys_company_external_ref
  ON idempotency_keys (company_id, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_webhook_events_external_ref
  ON call_webhook_events (external_ref)
  WHERE external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_event_deduplication_external_ref
  ON device_event_deduplication (external_ref)
  WHERE external_ref IS NOT NULL;

INSERT INTO schema_migrations (version, description)
VALUES (
  '20260810_expand_operational_schema',
  'Expanded APP operational schema for merchant, dispatch, driver app, call agent, safety, device contracts and platform audit tables'
)
ON CONFLICT (version) DO NOTHING;
