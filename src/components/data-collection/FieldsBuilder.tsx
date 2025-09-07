import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Trash2, 
  Edit, 
  GripVertical, 
  AlertCircle,
  Save,
  X,
  Loader2,
  Database
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DataField {
  id?: string;
  field_name: string;
  field_display_name: string;
  field_display_name_ar?: string;
  field_type: string;
  is_required: boolean;
  validation_rules?: any;
  extraction_keywords?: string[];
  prompt_template?: string;
  ask_if_missing_template?: string;
  field_order: number;
  column_letter?: string;
}

interface FieldsBuilderProps {
  configId: string;
}

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' }
];

const SortableFieldItem: React.FC<{
  field: DataField;
  onEdit: (field: DataField) => void;
  onDelete: (id: string) => void;
}> = ({ field, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.id || field.field_name
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-background border rounded-lg p-4 space-y-2"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div {...attributes} {...listeners} className="mt-1 cursor-move">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{field.field_display_name}</p>
              {field.field_display_name_ar && (
                <span className="text-sm text-muted-foreground">
                  ({field.field_display_name_ar})
                </span>
              )}
              <Badge variant="outline" className="text-xs">
                {fieldTypes.find(t => t.value === field.field_type)?.label}
              </Badge>
              {field.is_required && (
                <Badge variant="destructive" className="text-xs">Required</Badge>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              Field Name: <code className="bg-muted px-1 rounded">{field.field_name}</code>
            </p>
            
            {field.extraction_keywords && field.extraction_keywords.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-2">
                <span className="text-xs text-muted-foreground">Keywords:</span>
                {field.extraction_keywords.map((keyword, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(field)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => field.id && onDelete(field.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const FieldsBuilder: React.FC<FieldsBuilderProps> = ({ configId }) => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<DataField | null>(null);
  const [fieldForm, setFieldForm] = useState<DataField>({
    field_name: '',
    field_display_name: '',
    field_display_name_ar: '',
    field_type: 'text',
    is_required: false,
    extraction_keywords: [],
    prompt_template: '',
    ask_if_missing_template: '',
    field_order: 0
  });

  // Fetch existing fields
  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['data-collection-fields', configId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_collection_fields')
        .select('*')
        .eq('config_id', configId)
        .order('field_order', { ascending: true });

      if (error) throw error;
      return data as DataField[];
    }
  });

  // Create or update field
  const saveField = useMutation({
    mutationFn: async (field: DataField) => {
      if (editingField?.id) {
        const { error } = await supabase
          .from('data_collection_fields')
          .update(field)
          .eq('id', editingField.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('data_collection_fields')
          .insert({ ...field, config_id: configId });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-collection-fields', configId] });
      toast.success(editingField ? "Field updated successfully" : "Field added successfully");
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save field");
    }
  });

  // Delete field
  const deleteField = useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase
        .from('data_collection_fields')
        .delete()
        .eq('id', fieldId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-collection-fields', configId] });
      toast.success("Field deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete field");
    }
  });

  // Update field order
  const updateFieldOrder = useMutation({
    mutationFn: async (updatedFields: { id: string; field_order: number }[]) => {
      const promises = updatedFields.map(field =>
        supabase
          .from('data_collection_fields')
          .update({ field_order: field.field_order })
          .eq('id', field.id)
      );
      
      const results = await Promise.all(promises);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-collection-fields', configId] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update field order");
    }
  });

  const resetForm = () => {
    setFieldForm({
      field_name: '',
      field_display_name: '',
      field_display_name_ar: '',
      field_type: 'text',
      is_required: false,
      extraction_keywords: [],
      prompt_template: '',
      ask_if_missing_template: '',
      field_order: fields.length
    });
    setEditingField(null);
    setIsDialogOpen(false);
  };

  // Helper function to get default keywords based on field type (supports both English and Arabic)
  const getDefaultKeywords = (fieldType: string): string[] => {
    switch (fieldType) {
      case 'phone': return ['phone', 'mobile', 'number', 'رقم', 'هاتف', 'جوال'];
      case 'email': return ['email', 'mail', 'ايميل', 'بريد'];
      case 'number': return ['number', 'age', 'quantity', 'رقم', 'عدد', 'كمية', 'عمر'];
      case 'date': return ['date', 'birthday', 'birth', 'when', 'تاريخ', 'ميلاد', 'ولادة', 'متى', 'يوم', 'شهر', 'سنة'];
      default: return ['name', 'اسم', 'معلومات'];
    }
  };

  // Helper function to generate default templates
  const getDefaultTemplates = (fieldType: string, displayName: string) => {
    const templates = {
      text: {
        prompt: `Extract the ${displayName} from the message`,
        askIfMissing: `Could you please provide your ${displayName}?`
      },
      phone: {
        prompt: `Extract the phone number for ${displayName} from the message`,
        askIfMissing: `Could you please provide your phone number?`
      },
      email: {
        prompt: `Extract the email address for ${displayName} from the message`,
        askIfMissing: `Could you please provide your email address?`
      },
      number: {
        prompt: `Extract the number for ${displayName} from the message`,
        askIfMissing: `Could you please provide the ${displayName}?`
      },
      date: {
        prompt: `Extract the date for ${displayName} from the message (format: DD/MM/YYYY or MM/DD/YYYY)`,
        askIfMissing: `Could you please provide the ${displayName}? (e.g., 15/03/1990)`
      }
    };
    return templates[fieldType] || templates.text;
  };

  const handleEdit = (field: DataField) => {
    setEditingField(field);
    setFieldForm(field);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!fieldForm.field_display_name) {
      toast.error("Field name is required");
      return;
    }

    // Auto-generate field_name from display name
    const generatedFieldName = fieldForm.field_display_name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_\u0600-\u06FF]/g, '')
      .replace(/[\u0600-\u06FF]/g, '') // Remove Arabic characters for field_name
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 50); // Limit length

    // Generate default extraction keywords based on field name and type
    const defaultKeywords = [
      fieldForm.field_display_name,
      generatedFieldName.replace(/_/g, ' '),
      ...getDefaultKeywords(fieldForm.field_type)
    ];

    // Generate default templates based on field type
    const templates = getDefaultTemplates(fieldForm.field_type, fieldForm.field_display_name);

    const finalForm = {
      ...fieldForm,
      field_name: generatedFieldName || `field_${Date.now()}`,
      extraction_keywords: defaultKeywords,
      prompt_template: templates.prompt,
      ask_if_missing_template: templates.askIfMissing
    };

    saveField.mutate(finalForm);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = fields.findIndex(f => f.id === active.id);
    const newIndex = fields.findIndex(f => f.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedFields = [...fields];
      const [movedItem] = reorderedFields.splice(oldIndex, 1);
      reorderedFields.splice(newIndex, 0, movedItem);
      
      const updates = reorderedFields.map((field, index) => ({
        id: field.id!,
        field_order: index
      }));
      
      updateFieldOrder.mutate(updates);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Custom Fields
          </CardTitle>
          <CardDescription>
            Define the fields you want to collect from WhatsApp conversations. 
            These fields will be automatically extracted and exported to your Google Sheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No fields configured yet. Add your first field to start collecting data.
              </AlertDescription>
            </Alert>
          ) : (
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext 
                items={fields.map(f => f.id || f.field_name)} 
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {fields.map((field) => (
                    <SortableFieldItem
                      key={field.id}
                      field={field}
                      onEdit={handleEdit}
                      onDelete={deleteField.mutate}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          
          <Button onClick={() => setIsDialogOpen(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add New Field
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingField ? 'Edit Field' : 'Add New Field'}
            </DialogTitle>
            <DialogDescription>
              {editingField ? 'Modify the field configuration below.' : 'Configure a new field to collect data from WhatsApp conversations.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 py-4">
            {/* Field Name */}
            <div className="space-y-2">
              <Label htmlFor="field_display_name">
                Field Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="field_display_name"
                placeholder="e.g., Customer Name, Phone Number, Email Address"
                value={fieldForm.field_display_name}
                onChange={(e) => setFieldForm({ ...fieldForm, field_display_name: e.target.value })}
                className="text-left"
              />
              <p className="text-xs text-muted-foreground">
                Enter the name of the field you want to collect from customers (supports both Arabic and English)
              </p>
            </div>

            {/* Field Type */}
            <div className="space-y-2">
              <Label htmlFor="field_type">
                Field Type
              </Label>
              <Select 
                value={fieldForm.field_type} 
                onValueChange={(value) => setFieldForm({ ...fieldForm, field_type: value })}
              >
                <SelectTrigger id="field_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Required Field */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_required"
                checked={fieldForm.is_required}
                onCheckedChange={(checked) => setFieldForm({ ...fieldForm, is_required: !!checked })}
              />
              <Label htmlFor="is_required" className="cursor-pointer">
                This field is required
              </Label>
            </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveField.isPending}>
              {saveField.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingField ? 'Update Field' : 'Add Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FieldsBuilder;