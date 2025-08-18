import { useState, useEffect, useCallback } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';
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
  FileText
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
  performance_rating: number;
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

const AIPersonalities = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  
  // State management
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [templates, setTemplates] = useState<PersonalityTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('personalities');
  
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

  // Available intent categories
  const intentCategories = [
    { key: 'customer-support', label: 'Customer Support' },
    { key: 'sales', label: 'Sales Inquiries' },
    { key: 'technical', label: 'Technical Support' },
    { key: 'billing', label: 'Billing & Payments' },
    { key: 'general', label: 'General Information' }
  ];

  // Load data on component mount
  useEffect(() => {
    if (user) {
      loadWhatsAppInstances();
      loadTemplates();
    }
  }, [user]);

  useEffect(() => {
    if (selectedInstance) {
      loadPersonalities();
    }
  }, [selectedInstance]);

  // Load WhatsApp instances
  const loadWhatsAppInstances = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status')
        .eq('user_id', user?.id);
      
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
  };

  // Load personalities for selected instance
  const loadPersonalities = async () => {
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
    } catch (error) {
      logger.error('Error loading personalities:', error);
      toast.error('Failed to load personalities');
    } finally {
      setIsLoading(false);
    }
  };

  // Load personality templates
  const loadTemplates = async () => {
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
  };

  // Create or update personality
  const savePersonality = async () => {
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
  };

  // Delete personality
  const deletePersonality = async (personalityId: string) => {
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
  };

  // Clone template personality
  const cloneTemplate = async (templateId: string) => {
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
  };

  // Reset form
  const resetForm = () => {
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
  };

  // Open edit dialog
  const openEditDialog = (personality: Personality) => {
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
  };

  // Open create dialog
  const openCreateDialog = () => {
    setEditingPersonality(null);
    resetForm();
    setIsPersonalityDialogOpen(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.3 }}
      className="container mx-auto px-4 py-8 max-w-7xl"
    >
      <div className="space-y-8">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: 0.2 }}
          className="text-2xl font-semibold text-left md:text-3xl lg:text-4xl"
        >
          AI Personalities
        </motion.h1>
        
        {/* Instance Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="font-semibold">Choose WhatsApp Number</CardTitle>
            <CardDescription>
              Select the WhatsApp number to manage AI personalities for
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a WhatsApp instance" />
              </SelectTrigger>
              <SelectContent>
                {instances.map(instance => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.instance_name} ({instance.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedInstance && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="personalities">My Personalities</TabsTrigger>
              <TabsTrigger value="templates">Add From Templates</TabsTrigger>
            </TabsList>
            
            {/* Personalities Management Tab */}
            <TabsContent value="personalities" className="space-y-6 mt-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">Manage AI Personalities</h2>
                  <p className="text-muted-foreground">Create and customize AI personalities for different types of customer inquiries</p>
                </div>
                <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Personality
                </Button>
              </div>

              {/* Personalities Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {personalities.map((personality, index) => (
                    <motion.div
                      key={personality.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className={`h-full ${personality.is_default ? 'ring-2 ring-blue-500' : ''}`}>
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
                                {intentCategories.find(c => c.key === category)?.label || category}
                              </Badge>
                            ))}
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-0">
                          {/* Usage Statistics */}
                          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
                            <div>Used: {personality.usage_count} times</div>
                            <div>Rating: {personality.performance_rating}/10</div>
                          </div>
                          
                          {/* Status */}
                          <div className="flex items-center justify-between mb-4">
                            <Badge variant={personality.is_active ? "default" : "secondary"}>
                              {personality.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Priority: {personality.priority}
                            </span>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(personality)}
                              className="flex-1"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deletePersonality(personality.id)}
                              disabled={personality.is_default}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {personalities.length === 0 && !isLoading && (
                <Card>
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
                <h2 className="text-xl font-semibold">Personality Templates</h2>
                <p className="text-muted-foreground">Choose from pre-built personalities designed for common business scenarios</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {templates.map((template, index) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="h-full">
                      <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                          <Palette className="h-5 w-5 text-blue-500" />
                          {template.name}
                        </CardTitle>
                        <CardDescription>
                          {template.description}
                        </CardDescription>
                        
                        {/* Intent Categories */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.intent_categories.map(category => (
                            <Badge key={category} variant="outline" className="text-xs">
                              {intentCategories.find(c => c.key === category)?.label || category}
                            </Badge>
                          ))}
                        </div>
                      </CardHeader>
                      
                      <CardContent>
                        <Button
                          onClick={() => cloneTemplate(template.id)}
                          disabled={isLoading}
                          className="w-full bg-green-600 hover:bg-green-700"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Add This Personality
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Create/Edit Personality Dialog */}
      <Dialog open={isPersonalityDialogOpen} onOpenChange={setIsPersonalityDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPersonality ? 'Edit' : 'Create'} AI Personality
            </DialogTitle>
            <DialogDescription>
              Configure how your AI assistant should behave for specific types of customer inquiries
            </DialogDescription>
          </DialogHeader>
          
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
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={personalityForm.description}
                  onChange={(e) => setPersonalityForm({...personalityForm, description: e.target.value})}
                  placeholder="Brief description of this personality's role"
                />
              </div>
            </div>

            {/* Intent Categories */}
            <div className="space-y-2">
              <Label>Intent Categories</Label>
              <p className="text-sm text-muted-foreground">
                Select which types of customer inquiries this personality should handle
              </p>
              <div className="grid grid-cols-2 gap-2">
                {intentCategories.map(category => (
                  <div key={category.key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={category.key}
                      checked={personalityForm.intent_categories.includes(category.key)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPersonalityForm({
                            ...personalityForm,
                            intent_categories: [...personalityForm.intent_categories, category.key]
                          });
                        } else {
                          setPersonalityForm({
                            ...personalityForm,
                            intent_categories: personalityForm.intent_categories.filter(c => c !== category.key)
                          });
                        }
                      }}
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
                className="resize-y"
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
          
          <DialogFooter>
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
    </motion.div>
  );
};

export default AIPersonalities;