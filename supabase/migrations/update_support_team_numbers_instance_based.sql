-- ================================================================
-- Migration: Update support_team_numbers to be instance-based
-- Description: Add whatsapp_instance_id column and update policies
-- Date: 2025-01-04
-- ================================================================

-- Step 1: Add whatsapp_instance_id column (nullable first)
ALTER TABLE public.support_team_numbers
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID;

-- Step 2: Add foreign key constraint with CASCADE delete
ALTER TABLE public.support_team_numbers
  ADD CONSTRAINT support_team_numbers_instance_id_fkey
  FOREIGN KEY (whatsapp_instance_id)
  REFERENCES public.whatsapp_instances(id)
  ON DELETE CASCADE;

-- Step 3: Drop old unique constraint
ALTER TABLE public.support_team_numbers
  DROP CONSTRAINT IF EXISTS support_team_numbers_user_id_whatsapp_number_key;

-- Step 4: Add new unique constraint for instance + number
ALTER TABLE public.support_team_numbers
  ADD CONSTRAINT support_team_numbers_instance_number_unique
  UNIQUE (whatsapp_instance_id, whatsapp_number);

-- Step 5: Add performance index
CREATE INDEX IF NOT EXISTS idx_support_team_instance_active
  ON public.support_team_numbers(whatsapp_instance_id, is_active)
  WHERE is_active = true;

-- Step 6: Drop old RLS policies
DROP POLICY IF EXISTS "Users can view their support team numbers" ON public.support_team_numbers;
DROP POLICY IF EXISTS "Users can manage their support team numbers" ON public.support_team_numbers;

-- Step 7: Create new RLS policies for instance-based access
CREATE POLICY "Users can view their instance support numbers"
  ON public.support_team_numbers
  FOR SELECT
  TO authenticated
  USING (
    whatsapp_instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their instance support numbers"
  ON public.support_team_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    whatsapp_instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their instance support numbers"
  ON public.support_team_numbers
  FOR UPDATE
  TO authenticated
  USING (
    whatsapp_instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    whatsapp_instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their instance support numbers"
  ON public.support_team_numbers
  FOR DELETE
  TO authenticated
  USING (
    whatsapp_instance_id IN (
      SELECT id FROM public.whatsapp_instances
      WHERE user_id = auth.uid()
    )
  );

-- Step 8: Add helpful comment
COMMENT ON COLUMN public.support_team_numbers.whatsapp_instance_id IS 'Links support number to specific WhatsApp instance';
COMMENT ON COLUMN public.support_team_numbers.user_id IS 'Legacy column - kept for backward compatibility';

-- ================================================================
-- Migration Complete
-- Note: After running this migration, make the column NOT NULL:
-- ALTER TABLE public.support_team_numbers
--   ALTER COLUMN whatsapp_instance_id SET NOT NULL;
-- ================================================================
