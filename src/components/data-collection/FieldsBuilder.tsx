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
  Trash2, 
  Edit, 
  GripVertical, 
  AlertCircle,
  Loader2,
  CirclePlus,
  Settings2
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
  { value: 'date', label: 'Date' },
  { value: 'address', label: 'Address' }
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
      className="bg-background border rounded-lg p-3 sm:p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div {...attributes} {...listeners} className="cursor-move flex-shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Mobile Layout (Vertical) */}
            <div className="block lg:hidden">
              <div className="flex items-center flex-wrap gap-2">
                <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  {field.field_display_name}
                </p>
                {field.field_display_name_ar && (
                  <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                    ({field.field_display_name_ar})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {fieldTypes.find(t => t.value === field.field_type)?.label}
                </Badge>
                {field.is_required && (
                  <Badge variant="destructive" className="text-xs">Required</Badge>
                )}
              </div>
            </div>

            {/* Desktop Layout (Horizontal) */}
            <div className="hidden lg:flex lg:items-center lg:gap-3 lg:flex-wrap">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {field.field_display_name}
                {field.field_display_name_ar && (
                  <span className="text-sm text-slate-600 dark:text-slate-400 ml-2">
                    ({field.field_display_name_ar})
                  </span>
                )}
              </p>
              <Badge variant="outline" className="text-xs">
                {fieldTypes.find(t => t.value === field.field_type)?.label}
              </Badge>
              {field.is_required && (
                <Badge variant="destructive" className="text-xs">Required</Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(field)}
            className="h-8 w-8 p-0"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => field.id && onDelete(field.id)}
            className="h-8 w-8 p-0"
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
      case 'address': return ['address', 'location', 'street', 'city', 'area', 'عنوان', 'موقع', 'شارع', 'مدينة', 'منطقة', 'حي', 'مكان'];
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
      },
      address: {
        prompt: `Extract the complete address for ${displayName} from the message including street, city, and area`,
        askIfMissing: `Could you please provide your complete address including street, city, and area?`
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
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5 flex-shrink-0" />
            <span>Custom Fields</span>
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Define the fields you want to collect from WhatsApp conversations. 
            These fields will be automatically extracted and exported to your Google Sheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          {fields.length === 0 ? (
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  No fields configured yet. Add your first field to start collecting data.
                </p>
              </div>
            </div>
          ) : (
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext 
                items={fields.map(f => f.id || f.field_name)} 
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
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
          
          <Button 
            onClick={() => setIsDialogOpen(true)} 
            className="w-full mt-4 h-10 sm:h-11"
            size="default"
          >
            <CirclePlus className="h-4 w-4" />
            Add New Field
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] flex flex-col mx-auto">
          <DialogHeader className="flex-shrink-0 text-left">
            <DialogTitle className="text-lg sm:text-xl">
              {editingField ? 'Edit Field' : 'Add New Field'}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {editingField ? 'Modify the field configuration below.' : 'Configure a new field to collect data from WhatsApp conversations.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-5 py-4 px-1">
              {/* Field Name */}
              <div className="space-y-2">
                <Label htmlFor="field_display_name" className="text-sm font-medium">
                  Field Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="field_display_name"
                  placeholder="e.g., Customer Name, Phone Number, Email Address"
                  value={fieldForm.field_display_name}
                  onChange={(e) => setFieldForm({ ...fieldForm, field_display_name: e.target.value })}
                  className="text-left h-10"
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter the name of the field you want to collect from customers (supports both Arabic and English)
                </p>
              </div>

              {/* Field Type */}
              <div className="space-y-2">
                <Label htmlFor="field_type" className="text-sm font-medium">
                  Field Type
                </Label>
                <Select 
                  value={fieldForm.field_type} 
                  onValueChange={(value) => setFieldForm({ ...fieldForm, field_type: value })}
                >
                  <SelectTrigger id="field_type" className="h-10">
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
              <div className="flex items-center space-x-3 py-2">
                <Checkbox
                  id="is_required"
                  checked={fieldForm.is_required}
                  onCheckedChange={(checked) => setFieldForm({ ...fieldForm, is_required: !!checked })}
                />
                <Label htmlFor="is_required" className="cursor-pointer text-sm">
                  This field is required
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={resetForm} 
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saveField.isPending}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
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