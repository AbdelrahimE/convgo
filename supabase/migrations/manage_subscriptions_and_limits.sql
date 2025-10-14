-- ============================================================================
-- UNIFIED SUBSCRIPTION & AI LIMITS MANAGEMENT FUNCTION
-- ============================================================================
-- هذه دالة مركزية موحدة لإدارة الاشتراكات وحدود الذكاء الاصطناعي
-- تتعامل مع كل السيناريوهات بذكاء:
-- 1. اشتراك شهري منتهي → تعطيل كامل (limit=0, used=0)
-- 2. اشتراك سنوي منتهي → تعطيل كامل (limit=0, used=0)
-- 3. اشتراك سنوي نشط + مر 30 يوم → إعادة ضبط العداد فقط (used=0)
-- 4. اشتراك شهري نشط + مر 30 يوم → إعادة ضبط العداد فقط (used=0)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manage_subscriptions_and_limits()
RETURNS TABLE(
  total_processed INTEGER,
  expired_disabled INTEGER,
  active_reset INTEGER,
  execution_timestamp TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_processed INTEGER := 0;
  v_expired_disabled INTEGER := 0;
  v_active_reset INTEGER := 0;
  v_execution_time TIMESTAMPTZ;
BEGIN
  v_execution_time := NOW();

  -- ========================================================================
  -- STEP 1: تعطيل الاشتراكات المنتهية (شهرية وسنوية)
  -- ========================================================================
  WITH expired_subscriptions AS (
    UPDATE public.profiles
    SET
      monthly_ai_response_limit = 0,
      monthly_ai_responses_used = 0,
      is_active = false,
      updated_at = v_execution_time
    WHERE
      subscription_end_date < v_execution_time
      AND is_active = true
      AND monthly_ai_response_limit > 0
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_disabled FROM expired_subscriptions;

  -- ========================================================================
  -- STEP 2: إعادة ضبط العداد للاشتراكات النشطة (كل 30 يوم)
  -- ========================================================================
  -- هذا ينطبق على:
  -- - الاشتراكات الشهرية النشطة (لم تنته بعد)
  -- - الاشتراكات السنوية النشطة (تحتاج إعادة ضبط شهرية)
  WITH active_resets AS (
    UPDATE public.profiles
    SET
      monthly_ai_responses_used = 0,
      last_responses_reset_date = v_execution_time,
      updated_at = v_execution_time
    WHERE
      -- الاشتراك نشط ولم ينته
      subscription_end_date >= v_execution_time
      AND is_active = true
      -- مر 30 يوم منذ آخر إعادة ضبط
      AND last_responses_reset_date < (v_execution_time - INTERVAL '30 days')
      -- المستخدم لديه حد فعلي
      AND monthly_ai_response_limit > 0
    RETURNING id
  )
  SELECT COUNT(*) INTO v_active_reset FROM active_resets;

  -- حساب الإجمالي
  v_total_processed := v_expired_disabled + v_active_reset;

  -- إرجاع الإحصائيات
  RETURN QUERY SELECT
    v_total_processed,
    v_expired_disabled,
    v_active_reset,
    v_execution_time;
END;
$$;
