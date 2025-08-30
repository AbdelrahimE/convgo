-- =====================================================================
-- Test Script for Stored Procedures
-- =====================================================================
-- Run this AFTER creating the stored procedures to verify they work
-- =====================================================================

-- First, let's check if the procedures were created successfully
SELECT 
  'Checking procedures existence...' as status;

SELECT 
  proname as function_name,
  pronargs as argument_count,
  'Created Successfully ✓' as status
FROM pg_proc 
WHERE proname IN (
  'store_message_with_update',
  'check_and_update_ai_usage',
  'get_conversation_with_context'
)
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- =====================================================================
-- Test 1: Test store_message_with_update with a real conversation
-- =====================================================================
SELECT 
  '--- Test 1: Testing store_message_with_update ---' as test_name;

-- Get a sample conversation ID for testing
WITH sample_conversation AS (
  SELECT id 
  FROM whatsapp_conversations 
  WHERE status = 'active'
  LIMIT 1
)
SELECT 
  CASE 
    WHEN (data->>'success')::boolean = true THEN 'Test 1 PASSED ✓'
    ELSE 'Test 1 FAILED ✗: ' || COALESCE(data->>'error', 'Unknown error')
  END as test_result,
  data as response_data
FROM (
  SELECT store_message_with_update(
    (SELECT id FROM sample_conversation),
    'user',
    'Test message from stored procedure test script',
    'test_' || extract(epoch from now())::text
  ) as data
) test_result;

-- =====================================================================
-- Test 2: Test check_and_update_ai_usage (check only, no increment)
-- =====================================================================
SELECT 
  '--- Test 2: Testing check_and_update_ai_usage (check only) ---' as test_name;

-- Get a sample user ID for testing
WITH sample_user AS (
  SELECT id 
  FROM profiles 
  WHERE monthly_ai_response_limit > 0
  LIMIT 1
)
SELECT 
  CASE 
    WHEN data->>'limit' IS NOT NULL THEN 'Test 2 PASSED ✓'
    ELSE 'Test 2 FAILED ✗'
  END as test_result,
  data as response_data,
  'Check only - no increment' as test_mode
FROM (
  SELECT check_and_update_ai_usage(
    (SELECT id FROM sample_user),
    false
  ) as data
) test_result;

-- =====================================================================
-- Test 3: Test check_and_update_ai_usage with NULL user (edge case)
-- =====================================================================
SELECT 
  '--- Test 3: Testing check_and_update_ai_usage with NULL user ---' as test_name;

SELECT 
  CASE 
    WHEN (data->>'allowed')::boolean = true 
     AND (data->>'limit')::int = 0
     AND data->>'errorMessage' = 'No user ID provided for limit check'
    THEN 'Test 3 PASSED ✓ (NULL handled correctly)'
    ELSE 'Test 3 FAILED ✗'
  END as test_result,
  data as response_data
FROM (
  SELECT check_and_update_ai_usage(
    NULL,
    false
  ) as data
) test_result;

-- =====================================================================
-- Test 4: Test get_conversation_with_context (optional procedure)
-- =====================================================================
SELECT 
  '--- Test 4: Testing get_conversation_with_context ---' as test_name;

-- Get sample data for testing
WITH sample_data AS (
  SELECT 
    c.instance_id,
    c.user_phone
  FROM whatsapp_conversations c
  WHERE c.status = 'active'
  LIMIT 1
)
SELECT 
  CASE 
    WHEN data IS NOT NULL THEN 'Test 4 PASSED ✓'
    ELSE 'Test 4 INFO: No active conversation found (expected if no data)'
  END as test_result,
  CASE 
    WHEN data IS NOT NULL 
    THEN jsonb_pretty(data::jsonb)
    ELSE 'No data returned'
  END as response_data
FROM (
  SELECT get_conversation_with_context(
    (SELECT instance_id FROM sample_data),
    (SELECT user_phone FROM sample_data),
    5
  ) as data
) test_result;

-- =====================================================================
-- Performance Check: Compare execution times
-- =====================================================================
SELECT 
  '--- Performance Check ---' as check_name;

-- Check if procedures are being used and their performance
SELECT 
  proname as function_name,
  calls as total_calls,
  total_time as total_ms,
  mean_time as avg_ms_per_call,
  CASE 
    WHEN mean_time < 50 THEN 'EXCELLENT ✓'
    WHEN mean_time < 100 THEN 'GOOD ✓'
    WHEN mean_time < 200 THEN 'ACCEPTABLE'
    ELSE 'NEEDS OPTIMIZATION'
  END as performance_rating
FROM pg_stat_user_functions
WHERE schemaname = 'public'
AND proname IN (
  'store_message_with_update',
  'check_and_update_ai_usage',
  'get_conversation_with_context'
);

-- =====================================================================
-- Summary
-- =====================================================================
SELECT 
  '=====================' as line,
  'TEST SUMMARY' as title,
  '=====================' as line2,
  'Run each test above and verify:' as instructions,
  '1. All procedures exist (3 rows)' as check1,
  '2. Test 1-3 show PASSED ✓' as check2,
  '3. Performance ratings are GOOD or better' as check3,
  '4. No error messages in response_data' as check4;

-- =====================================================================
-- Cleanup (Optional - remove test messages)
-- =====================================================================
-- Uncomment to clean up test messages after testing:
/*
DELETE FROM whatsapp_conversation_messages 
WHERE message_id LIKE 'test_%'
AND content = 'Test message from stored procedure test script';
*/