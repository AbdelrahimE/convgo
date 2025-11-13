-- =====================================================================
-- Row Level Security Policies for external_action_responses Table
-- =====================================================================
-- This migration adds RLS policies to secure access to external action
-- webhook responses. Users can only access responses for their own
-- external actions through the ownership chain:
-- external_action_responses → external_action_logs → external_actions → user_id
-- =====================================================================

-- =====================================================================
-- STEP 1: Create Security Definer Helper Function
-- =====================================================================
-- This function checks if a user owns an external action response
-- by traversing the foreign key relationships. Using SECURITY DEFINER
-- allows it to bypass RLS on related tables, improving performance.
-- =====================================================================

CREATE OR REPLACE FUNCTION user_owns_external_action_response(response_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with creator's privileges, bypassing RLS
STABLE -- Result doesn't change within a transaction
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.external_action_responses ear
    INNER JOIN public.external_action_logs eal
      ON ear.execution_log_id = eal.id
    INNER JOIN public.external_actions ea
      ON eal.external_action_id = ea.id
    WHERE ear.id = response_id
      AND ea.user_id = auth.uid()
  );
END;
$$;

-- Add comment explaining the function's purpose
COMMENT ON FUNCTION user_owns_external_action_response(UUID) IS
'Security definer function to check if authenticated user owns an external action response.
Used in RLS policies for performance optimization.';

-- =====================================================================
-- STEP 2: Create Alternative Helper Function Using execution_log_id
-- =====================================================================
-- This variant accepts execution_log_id for use in different contexts
-- =====================================================================

CREATE OR REPLACE FUNCTION user_owns_execution_log(log_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.external_action_logs eal
    INNER JOIN public.external_actions ea
      ON eal.external_action_id = ea.id
    WHERE eal.id = log_id
      AND ea.user_id = auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION user_owns_execution_log(UUID) IS
'Security definer function to check if authenticated user owns an execution log.
Used for validating access to external action responses.';

-- =====================================================================
-- STEP 3: Enable Row Level Security
-- =====================================================================

ALTER TABLE public.external_action_responses ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- STEP 4: CREATE RLS POLICIES
-- =====================================================================

-- ---------------------------------------------------------------------
-- SELECT Policy: Users can view responses for their own external actions
-- ---------------------------------------------------------------------
-- This policy allows authenticated users to read responses only for
-- external actions they own. It uses the helper function for efficiency.
-- ---------------------------------------------------------------------

CREATE POLICY "Users can view their own external action responses"
ON public.external_action_responses
FOR SELECT
TO authenticated
USING (
  user_owns_execution_log(execution_log_id)
);

-- ---------------------------------------------------------------------
-- INSERT Policy: Service role can insert responses (system operations)
-- ---------------------------------------------------------------------
-- Edge functions running as service_role need to create response records
-- when wait_for_webhook responses are initialized. Regular users should
-- not be able to create responses directly.
-- Note: service_role bypasses RLS, but this policy documents intent.
-- ---------------------------------------------------------------------

CREATE POLICY "Service role can insert external action responses"
ON public.external_action_responses
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow insert only if user owns the related external action
  -- This protects against malicious clients trying to create fake responses
  user_owns_execution_log(execution_log_id)
);

-- ---------------------------------------------------------------------
-- UPDATE Policy: Service role can update responses (webhook callbacks)
-- ---------------------------------------------------------------------
-- When webhook callbacks arrive via external-action-response-handler,
-- the system needs to update the response record with the received data.
-- Users should not be able to modify responses directly.
-- ---------------------------------------------------------------------

CREATE POLICY "Service role can update external action responses"
ON public.external_action_responses
FOR UPDATE
TO authenticated
USING (
  -- User can only update responses for their own external actions
  user_owns_external_action_response(id)
)
WITH CHECK (
  -- Ensure the response still belongs to the user after update
  user_owns_external_action_response(id)
);

-- ---------------------------------------------------------------------
-- DELETE Policy: Users can delete responses for their own external actions
-- ---------------------------------------------------------------------
-- This allows users to clean up old response records through the UI.
-- Typically handled via CASCADE when external actions are deleted,
-- but this provides explicit control.
-- ---------------------------------------------------------------------

CREATE POLICY "Users can delete their own external action responses"
ON public.external_action_responses
FOR DELETE
TO authenticated
USING (
  user_owns_external_action_response(id)
);

-- =====================================================================
-- STEP 5: Grant Necessary Permissions
-- =====================================================================
-- Ensure authenticated users can execute the helper functions
-- =====================================================================

GRANT EXECUTE ON FUNCTION user_owns_external_action_response(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_owns_execution_log(UUID) TO authenticated;

-- =====================================================================
-- STEP 6: Create Indexes for RLS Performance
-- =====================================================================
-- These indexes optimize the JOIN queries in the helper functions
-- =====================================================================

-- Index on execution_log_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_external_action_responses_execution_log
ON public.external_action_responses(execution_log_id)
WHERE response_received = false;

-- Index on external_action_logs for ownership checks
CREATE INDEX IF NOT EXISTS idx_external_action_logs_action_user
ON public.external_action_logs(external_action_id, id);
