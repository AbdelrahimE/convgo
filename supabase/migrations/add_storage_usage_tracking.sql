-- ============================================================================
-- STORAGE USAGE TRACKING SYSTEM
-- ============================================================================
-- هذا الـ migration يضيف نظام تتبع استهلاك التخزين التلقائي
-- يتم تحديث storage_used_mb تلقائياً عند رفع/حذف الملفات
-- ============================================================================

-- ============================================================================
-- STEP 1: إضافة عمود storage_used_mb إلى جدول profiles
-- ============================================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS storage_used_mb NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- إضافة تعليق توضيحي للعمود
COMMENT ON COLUMN public.profiles.storage_used_mb IS 'Total storage used by user in MB, automatically updated by trigger';

-- إضافة index لتحسين الأداء عند الاستعلام عن استهلاك التخزين
CREATE INDEX IF NOT EXISTS idx_profiles_storage_usage
ON public.profiles (storage_used_mb, storage_limit_mb);

-- ============================================================================
-- STEP 2: حساب الاستهلاك الحالي لجميع المستخدمين الموجودين
-- ============================================================================
-- هذا مهم لملء البيانات الحالية للمستخدمين الذين لديهم ملفات بالفعل
UPDATE public.profiles p
SET storage_used_mb = COALESCE(
  (
    SELECT SUM(f.size_bytes) / 1024.0 / 1024.0
    FROM public.files f
    WHERE f.profile_id = p.id
  ),
  0
)
WHERE EXISTS (
  SELECT 1 FROM public.files f WHERE f.profile_id = p.id
);

-- ============================================================================
-- STEP 3: إنشاء Trigger Function لتحديث storage_used_mb تلقائياً
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_user_storage_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size_mb NUMERIC(10, 2);
BEGIN
  -- حساب حجم الملف بالـ MB
  v_size_mb := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.size_bytes / 1024.0 / 1024.0
    WHEN TG_OP = 'DELETE' THEN OLD.size_bytes / 1024.0 / 1024.0
    WHEN TG_OP = 'UPDATE' THEN (NEW.size_bytes - OLD.size_bytes) / 1024.0 / 1024.0
    ELSE 0
  END;

  -- تحديث استهلاك التخزين حسب العملية
  IF TG_OP = 'INSERT' THEN
    -- عند إضافة ملف جديد
    UPDATE public.profiles
    SET
      storage_used_mb = storage_used_mb + v_size_mb,
      updated_at = NOW()
    WHERE id = NEW.profile_id;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- عند حذف ملف
    UPDATE public.profiles
    SET
      storage_used_mb = GREATEST(0, storage_used_mb - v_size_mb),
      updated_at = NOW()
    WHERE id = OLD.profile_id;

    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- عند تعديل حجم الملف (نادر الحدوث)
    UPDATE public.profiles
    SET
      storage_used_mb = GREATEST(0, storage_used_mb + v_size_mb),
      updated_at = NOW()
    WHERE id = NEW.profile_id;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- إضافة تعليق توضيحي للدالة
COMMENT ON FUNCTION public.update_user_storage_usage() IS
'Automatically updates user storage usage when files are inserted, updated, or deleted';

-- ============================================================================
-- STEP 4: إنشاء Trigger على جدول files
-- ============================================================================
DROP TRIGGER IF EXISTS files_storage_usage_trigger ON public.files;

CREATE TRIGGER files_storage_usage_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.files
FOR EACH ROW
EXECUTE FUNCTION public.update_user_storage_usage();

-- إضافة تعليق توضيحي للـ trigger
COMMENT ON TRIGGER files_storage_usage_trigger ON public.files IS
'Automatically updates profiles.storage_used_mb when files are added, modified, or deleted';

-- ============================================================================
-- STEP 5: إنشاء دالة مساعدة لحساب الاستهلاك الفعلي (للتحقق)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_actual_storage_usage(user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual_usage NUMERIC;
BEGIN
  SELECT COALESCE(SUM(size_bytes) / 1024.0 / 1024.0, 0)
  INTO v_actual_usage
  FROM public.files
  WHERE profile_id = user_id;

  RETURN v_actual_usage;
END;
$$;

COMMENT ON FUNCTION public.calculate_actual_storage_usage(UUID) IS
'Helper function to verify actual storage usage for a user';
