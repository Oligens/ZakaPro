BEGIN;

-- ZakaPro — isolation multi-tenant App → Plan
-- Idempotente et sûre pour une base existante.

CREATE UNIQUE INDEX IF NOT EXISTS uq_plans_app_id_id
  ON plans (app_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_checkout_intent_app_plan'
      AND conrelid = 'checkout_payment_intents'::regclass
  ) THEN
    ALTER TABLE checkout_payment_intents
      ADD CONSTRAINT fk_checkout_intent_app_plan
      FOREIGN KEY (app_id, plan_id)
      REFERENCES plans (app_id, id)
      ON DELETE CASCADE;
  END IF;
END
$$;

COMMIT;
