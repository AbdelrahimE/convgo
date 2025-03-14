
CREATE OR REPLACE FUNCTION public.get_unique_debug_categories()
RETURNS TABLE (category text)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT wdl.category
  FROM webhook_debug_logs wdl
  ORDER BY wdl.category ASC;
END;
$$;
