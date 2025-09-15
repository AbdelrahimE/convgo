-- Enable Row Level Security for external_actions table
ALTER TABLE public.external_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for external_actions table
CREATE POLICY "Users can view their own external actions" ON public.external_actions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own external actions" ON public.external_actions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own external actions" ON public.external_actions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own external actions" ON public.external_actions
    FOR DELETE USING (user_id = auth.uid());

-- Enable Row Level Security for external_action_logs table
ALTER TABLE public.external_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for external_action_logs table (access via external_actions ownership)
CREATE POLICY "Users can view logs for their own external actions" ON public.external_action_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.external_actions 
            WHERE external_actions.id = external_action_logs.external_action_id 
            AND external_actions.user_id = auth.uid()
        )
    );

CREATE POLICY "System can insert external action logs" ON public.external_action_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.external_actions 
            WHERE external_actions.id = external_action_logs.external_action_id 
            AND external_actions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update logs for their own external actions" ON public.external_action_logs
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.external_actions 
            WHERE external_actions.id = external_action_logs.external_action_id 
            AND external_actions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete logs for their own external actions" ON public.external_action_logs
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.external_actions 
            WHERE external_actions.id = external_action_logs.external_action_id 
            AND external_actions.user_id = auth.uid()
        )
    );