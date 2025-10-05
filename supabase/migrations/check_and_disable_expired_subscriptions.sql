-- ============================================================================
-- Create function to check and disable expired subscriptions
-- ============================================================================
-- This function:
-- - Finds all active users with expired subscriptions (subscription_end_date < NOW())
-- - Sets their monthly_ai_response_limit to 0
-- - Returns count and list of affected users for logging
-- - Uses SECURITY DEFINER to run with elevated privileges

CREATE OR REPLACE FUNCTION public.check_and_disable_expired_subscriptions()
RETURNS TABLE(
  affected_count INTEGER,
  execution_timestamp TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected_count INTEGER;
  v_execution_time TIMESTAMPTZ;
BEGIN
  -- وقت التنفيذ
  v_execution_time := NOW();

  -- تحديث الاشتراكات المنتهية مباشرة
  WITH updated_users AS (
    UPDATE public.profiles
    SET
      monthly_ai_response_limit = 0,
      updated_at = v_execution_time
    WHERE subscription_end_date < v_execution_time
      AND monthly_ai_response_limit > 0
      AND is_active = true
    RETURNING id
  )
  SELECT COUNT(*) INTO v_affected_count FROM updated_users;

  -- لو لم يتم تحديث أحد، ضع القيمة 0
  IF v_affected_count IS NULL THEN
    v_affected_count := 0;
  END IF;

  -- إرجاع النتيجة
  RETURN QUERY SELECT
    v_affected_count,
    v_execution_time;
END;
$$;

COMMENT ON FUNCTION public.check_and_disable_expired_subscriptions() IS
'Fast version: disables expired subscriptions by setting AI response limit = 0, returns only count and timestamp.';