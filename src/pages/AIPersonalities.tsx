import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Star, 
  BarChart3, 
  Brain, 
  Users, 
  MessageSquare,
  Loader2,
  Palette,
  FileText,
  Bot,
  Cog
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import logger from '@/utils/logger';

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
}

interface Personality {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  temperature: number;
  model: string;
  intent_categories: string[];
  is_active: boolean;
  is_default: boolean;
  priority: number;
  process_voice_messages: boolean;
  voice_message_default_response: string;
  default_voice_language: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
  template_category?: string;
}

interface PersonalityTemplate {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  template_category: string;
  intent_categories: string[];
}

// Memoized PersonalityCard component
const PersonalityCard = React.memo<{
  personality: Personality;
  onEdit: (personality: Personality) => void;
  onDelete: (personalityId: string) => void;
  intentCategoriesMap: Map<string, string>;
}>(({ personality, onEdit, onDelete, intentCategoriesMap }) => (
  <Card className={`h-full w-full flex flex-col ${personality.is_default ? 'ring-2 ring-blue-500' : ''} border-slate-200 dark:border-slate-700`}>
    <CardHeader className="pb-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            {personality.name}
            {personality.is_default && (
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
            )}
          </CardTitle>
          <CardDescription className="text-sm">
            {personality.description}
          </CardDescription>
        </div>
      </div>
      
      {/* Intent Categories */}
      <div className="flex flex-wrap gap-1 mt-2">
        {personality.intent_categories.map(category => (
          <Badge key={category} variant="secondary" className="text-xs">
            {intentCategoriesMap.get(category) || category}
          </Badge>
        ))}
      </div>
    </CardHeader>
    
    <CardContent className="pt-0 flex-grow flex flex-col">
      <div className="flex-grow">
        {/* Usage Statistics */}
        <div className="text-sm text-muted-foreground mb-4">
          <div>Used: {personality.usage_count} times</div>
        </div>
        
        {/* Status */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant={personality.is_active ? "default" : "secondary"}>
            {personality.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Priority: {personality.priority}
          </span>
        </div>
      </div>
      
      {/* Actions - Fixed at Bottom */}
      <div className="flex gap-2 mt-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(personality)}
          className="flex-1"
        >
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(personality.id)}
          disabled={personality.is_default}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
));

// Memoized TemplateCard component
const TemplateCard = React.memo<{
  template: PersonalityTemplate;
  onClone: (templateId: string) => void;
  intentCategoriesMap: Map<string, string>;
  isLoading: boolean;
}>(({ template, onClone, intentCategoriesMap, isLoading }) => (
  <Card className="h-full w-full flex flex-col border-slate-200 dark:border-slate-700">
    <CardHeader className="flex-grow">
      <CardTitle className="text-lg font-semibold flex items-center gap-2">
        <Bot className="h-5 w-5 text-blue-600" />
        {template.name}
      </CardTitle>
      <CardDescription>
        {template.description}
      </CardDescription>
      
      {/* Intent Categories */}
      <div className="flex flex-wrap gap-1 mt-2">
        {template.intent_categories.map(category => (
          <Badge key={category} variant="outline" className="text-xs">
            {intentCategoriesMap.get(category) || category}
          </Badge>
        ))}
      </div>
    </CardHeader>
    
    <CardContent className="mt-auto">
      <Button
        onClick={() => onClone(template.id)}
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        <Copy className="h-4 w-4 mr-2" />
        Add This Personality
      </Button>
    </CardContent>
  </Card>
));

const AIPersonalities = React.memo(() => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  
  // State management
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [templates, setTemplates] = useState<PersonalityTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPersonalities, setIsLoadingPersonalities] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [initialPageLoading, setInitialPageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('personalities');
  const [usageAnalytics, setUsageAnalytics] = useState<Record<string, number>>({});
  
  // Dialog states
  const [isPersonalityDialogOpen, setIsPersonalityDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingPersonality, setEditingPersonality] = useState<Personality | null>(null);
  
  // Form states
  const [personalityForm, setPersonalityForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    temperature: 0.7,
    model: 'gpt-4o-mini',
    intent_categories: [] as string[],
    is_active: true,
    is_default: false,
    priority: 1,
    process_voice_messages: true,
    voice_message_default_response: '',
    default_voice_language: 'en'
  });

  // Available intent categories - optimized as array and Map
  const intentCategories = useMemo(() => [
    { key: 'customer-support', label: 'Customer Support' },
    { key: 'sales', label: 'Sales Inquiries' },
    { key: 'technical', label: 'Technical Support' },
    { key: 'billing', label: 'Billing & Payments' },
    { key: 'general', label: 'General Information' }
  ], []);
  
  // Create lookup Map for O(1) category label access
  const intentCategoriesMap = useMemo(() => 
    new Map(intentCategories.map(c => [c.key, c.label])),
    [intentCategories]
  );

  // Load WhatsApp instances - memoized
  const loadWhatsAppInstances = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user?.id)
        .eq('status', 'Connected');
      
      if (error) throw error;
      setInstances(data || []);
      
      if (data && data.length > 0) {
        setSelectedInstance(data[0].id);
      }
    } catch (error) {
      logger.error('Error loading WhatsApp instances:', error);
      toast.error('Failed to load WhatsApp instances');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load personalities for selected instance - memoized
  const loadPersonalities = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'list',
          whatsappInstanceId: selectedInstance
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setPersonalities(data.personalities || []);
      
      // Load usage analytics from actual interactions
      // We'll call loadUsageAnalytics separately to avoid circular dependency
    } catch (error) {
      logger.error('Error loading personalities:', error);
      toast.error('Failed to load personalities');
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance]);
  
  // Load usage analytics from whatsapp_ai_interactions - memoized
  const loadUsageAnalytics = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      logger.info('Loading personality usage analytics', { instanceId: selectedInstance });
      
      const { data, error } = await supabase.rpc('get_personality_usage_analytics', {
        p_whatsapp_instance_id: selectedInstance
      });
      
      if (error) {
        logger.error('Error loading usage analytics:', error);
        return;
      }
      
      // Convert to a map for easy lookup
      const analyticsMap: Record<string, number> = {};
      if (data && Array.isArray(data)) {
        data.forEach((stat: any) => {
          if (stat.personality_id) {
            analyticsMap[stat.personality_id] = parseInt(stat.usage_count) || 0;
          }
        });
      }
      
      setUsageAnalytics(analyticsMap);
      logger.info('Usage analytics loaded', { 
        personalityCount: Object.keys(analyticsMap).length,
        analytics: analyticsMap 
      });
    } catch (error) {
      logger.error('Exception loading usage analytics:', error);
    }
  }, [selectedInstance]);

  // Load personality templates - memoized
  const loadTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: { action: 'get_templates' }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setTemplates(data.templates || []);
    } catch (error) {
      logger.error('Error loading templates:', error);
      toast.error('Failed to load personality templates');
    }
  }, []);

  // Reset form - memoized (moved before functions that depend on it)
  const resetForm = useCallback(() => {
    setPersonalityForm({
      name: '',
      description: '',
      system_prompt: '',
      temperature: 0.7,
      model: 'gpt-4o-mini',
      intent_categories: [],
      is_active: true,
      is_default: false,
      priority: 1,
      process_voice_messages: true,
      voice_message_default_response: '',
      default_voice_language: 'en'
    });
  }, []);

  // Open edit dialog - memoized
  const openEditDialog = useCallback((personality: Personality) => {
    setEditingPersonality(personality);
    setPersonalityForm({
      name: personality.name,
      description: personality.description,
      system_prompt: personality.system_prompt,
      temperature: personality.temperature,
      model: personality.model,
      intent_categories: personality.intent_categories,
      is_active: personality.is_active,
      is_default: personality.is_default,
      priority: personality.priority,
      process_voice_messages: personality.process_voice_messages,
      voice_message_default_response: personality.voice_message_default_response,
      default_voice_language: personality.default_voice_language
    });
    setIsPersonalityDialogOpen(true);
  }, []);

  // Handle intent category checkbox change
  const handleIntentCategoryChange = useCallback((categoryKey: string, checked: boolean) => {
    setPersonalityForm(prev => ({
      ...prev,
      intent_categories: checked 
        ? [...prev.intent_categories, categoryKey]
        : prev.intent_categories.filter(c => c !== categoryKey)
    }));
  }, []);

  // Create or update personality - memoized (now resetForm is defined above)
  const savePersonality = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      setIsLoading(true);
      
      const action = editingPersonality ? 'update' : 'create';
      const requestBody: any = {
        action,
        whatsappInstanceId: selectedInstance,
        data: personalityForm
      };
      
      if (editingPersonality) {
        requestBody.personalityId = editingPersonality.id;
      }
      
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: requestBody
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success(`Personality ${action === 'create' ? 'created' : 'updated'} successfully`);
      setIsPersonalityDialogOpen(false);
      setEditingPersonality(null);
      resetForm();
      await loadPersonalities();
    } catch (error) {
      logger.error('Error saving personality:', error);
      toast.error(`Failed to ${editingPersonality ? 'update' : 'create'} personality`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance, editingPersonality, personalityForm, loadPersonalities, resetForm]);

  // Delete personality - memoized
  const deletePersonality = useCallback(async (personalityId: string) => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'delete',
          personalityId
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success('Personality deleted successfully');
      await loadPersonalities();
    } catch (error) {
      logger.error('Error deleting personality:', error);
      toast.error('Failed to delete personality');
    } finally {
      setIsLoading(false);
    }
  }, [loadPersonalities]);

  // Clone template personality - memoized
  const cloneTemplate = useCallback(async (templateId: string) => {
    if (!selectedInstance) return;
    
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('manage-personalities', {
        body: {
          action: 'clone_template',
          whatsappInstanceId: selectedInstance,
          templateId
        }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast.success('Personality template added successfully');
      setIsTemplateDialogOpen(false);
      await loadPersonalities();
    } catch (error) {
      logger.error('Error cloning template:', error);
      toast.error('Failed to add personality template');
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance, loadPersonalities]);

  // Open create dialog - memoized (now resetForm is defined above)
  const openCreateDialog = useCallback(() => {
    setEditingPersonality(null);
    resetForm();
    setIsPersonalityDialogOpen(true);
  }, [resetForm]);

  // Load data on component mount - now all functions are defined
  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
      loadTemplates();
    }
    // Set initial page loading to false after a short delay
    const timer = setTimeout(() => {
      setInitialPageLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [user, loadWhatsAppInstances, loadTemplates]);

  useEffect(() => {
    if (selectedInstance) {
      loadPersonalities();
      loadUsageAnalytics();
    }
  }, [selectedInstance, loadPersonalities, loadUsageAnalytics]);

  // Show initial loading state
  if (initialPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          {/* Modern animated loader with gradient */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Loading AI Personalities
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Please wait while we prepare your personality settings...
            </p>
          </div>
          
          {/* Loading dots animation */}
          <div className="flex space-x-1">
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  AI Personalities
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  Create and customize AI personalities for different types of customer inquiries
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        
        {/* WhatsApp Instance Selection */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5" />
                Choose WhatsApp Number
              </h2>
            </div>

            <Select
              value={selectedInstance}
              onValueChange={(value) => setSelectedInstance(value)}
              disabled={isLoading || instances.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select WhatsApp number" />
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 ? (
                  <SelectItem value="none">
                    No connected WhatsApp numbers available
                  </SelectItem>
                ) : (
                  instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center justify-between w-full gap-x-2">
                        <span>{instance.instance_name}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                          Connected
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedInstance && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="personalities">My Personalities</TabsTrigger>
                  <TabsTrigger value="templates">Add From Templates</TabsTrigger>
                </TabsList>
                
                {/* Personalities Management Tab */}
                <TabsContent value="personalities" className="space-y-6 mt-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                    <div className="flex items-center gap-2 mb-0">
                      <Users className="h-5 w-5 text-blue-600" />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manage AI Personalities</h2>
                    </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Create and customize AI personalities for different types of customer inquiries</p>
                    </div>
                    <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Personality
                    </Button>
                  </div>

                  {/* Personalities Grid */}
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {personalities.map((personality) => (
                      <div key={personality.id} className="flex">
                        <PersonalityCard
                          personality={personality}
                          onEdit={openEditDialog}
                          onDelete={deletePersonality}
                          intentCategoriesMap={intentCategoriesMap}
                        />
                      </div>
                    ))}
                  </div>

                  {personalities.length === 0 && !isLoading && (
                    <Card className="border-slate-200 dark:border-slate-700">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
                      <div>
                        <h3 className="text-lg font-semibold">No AI Personalities Yet</h3>
                        <p className="text-muted-foreground">
                          Create your first personality or choose from our templates to get started
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700">
                          <Plus className="mr-2 h-4 w-4" />
                          Create Personality
                        </Button>
                        <Button variant="outline" onClick={() => setActiveTab('templates')}>
                          <FileText className="mr-2 h-4 w-4" />
                          Browse Templates
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                    </Card>
                  )}
                </TabsContent>
                
                {/* Templates Tab */}
                <TabsContent value="templates" className="space-y-6 mt-6">
                  <div>
                    <div className="flex items-center gap-2 mb-0">
                      <Bot className="h-5 w-5 text-blue-600" />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Personality Templates</h2>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Choose from pre-built personalities designed for common business scenarios</p>
                  </div>

                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {templates.map((template) => (
                      <div key={template.id} className="flex">
                        <TemplateCard
                          template={template}
                          onClone={cloneTemplate}
                          intentCategoriesMap={intentCategoriesMap}
                          isLoading={isLoading}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Personality Dialog */}
      <Dialog open={isPersonalityDialogOpen} onOpenChange={setIsPersonalityDialogOpen}>
        <DialogContent className="w-full max-w-[90vw] sm:max-w-lg md:max-w-xl lg:max-w-2xl h-[85vh] p-0 border-none flex flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-0 flex-shrink-0">
            <DialogTitle className="text-left">
              {editingPersonality ? 'Edit' : 'Create'} AI Personality
            </DialogTitle>
            <DialogDescription className="text-left">
              Configure how your AI assistant should behave for specific types of customer inquiries
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Personality Name</Label>
                <Input
                  id="name"
                  value={personalityForm.name}
                  onChange={(e) => setPersonalityForm({...personalityForm, name: e.target.value})}
                  placeholder="e.g., Customer Support Specialist"
                  className="text-sm sm:text-base"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={personalityForm.description}
                  onChange={(e) => setPersonalityForm({...personalityForm, description: e.target.value})}
                  placeholder="Brief description of this personality's role"
                  className="text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Intent Categories */}
            <div className="space-y-0">
              <Label className="text-base font-semibold">Intent Categories</Label>
              <p className="text-sm text-muted-foreground">
                Select which types of customer inquiries this personality should handle
              </p>
              <div className="grid grid-cols-1 gap-2 pt-4">
                {intentCategories.map(category => (
                  <div key={category.key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={category.key}
                      checked={personalityForm.intent_categories.includes(category.key)}
                      onChange={(e) => handleIntentCategoryChange(category.key, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor={category.key} className="text-sm">
                      {category.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="system-prompt">System Prompt</Label>
              <LanguageAwareTextarea
                id="system-prompt"
                value={personalityForm.system_prompt}
                onChange={(e) => setPersonalityForm({...personalityForm, system_prompt: e.target.value})}
                rows={8}
                placeholder="Define how this AI personality should behave and respond..."
                className="resize-y text-sm sm:text-base"
              />
            </div>

            {/* Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature ({personalityForm.temperature})</Label>
                <input
                  type="range"
                  id="temperature"
                  min="0"
                  max="1"
                  step="0.1"
                  value={personalityForm.temperature}
                  onChange={(e) => setPersonalityForm({...personalityForm, temperature: parseFloat(e.target.value)})}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more focused, Higher = more creative
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Input
                  type="number"
                  id="priority"
                  min="1"
                  max="10"
                  value={personalityForm.priority}
                  onChange={(e) => setPersonalityForm({...personalityForm, priority: parseInt(e.target.value)})}
                  className="text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Status Toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Active</Label>
                  <p className="text-sm text-muted-foreground">Enable this personality</p>
                </div>
                <Switch
                  checked={personalityForm.is_active}
                  onCheckedChange={(checked) => setPersonalityForm({...personalityForm, is_active: checked})}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Default Personality</Label>
                  <p className="text-sm text-muted-foreground">Use as fallback when intent is unclear</p>
                </div>
                <Switch
                  checked={personalityForm.is_default}
                  onCheckedChange={(checked) => setPersonalityForm({...personalityForm, is_default: checked})}
                />
              </div>
            </div>
            </div>
          </div>
          
          <DialogFooter className="px-4 py-3 flex-shrink-0 border-t border-border bg-white dark:bg-slate-900">
            <Button variant="outline" onClick={() => setIsPersonalityDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={savePersonality}
              disabled={isLoading || !personalityForm.name || !personalityForm.system_prompt}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                `${editingPersonality ? 'Update' : 'Create'} Personality`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default AIPersonalities;