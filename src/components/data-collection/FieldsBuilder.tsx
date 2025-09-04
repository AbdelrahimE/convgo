import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  Loader2
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
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
  { value: 'address', label: 'Address' },
  { value: 'select', label: 'Select Options' },
  { value: 'boolean', label: 'Yes/No' }
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
  const { toast } = useToast();
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
      toast({
        title: "Success",
        description: editingField ? "Field updated successfully" : "Field added successfully",
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save field",
        variant: "destructive",
      });
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
      toast({
        title: "Success",
        description: "Field deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete field",
        variant: "destructive",
      });
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
      toast({
        title: "Error",
        description: error.message || "Failed to update field order",
        variant: "destructive",
      });
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

  const handleEdit = (field: DataField) => {
    setEditingField(field);
    setFieldForm(field);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!fieldForm.field_name || !fieldForm.field_display_name) {
      toast({
        title: "Validation Error",
        description: "Field name and display name are required",
        variant: "destructive",
      });
      return;
    }

    // Generate field_name from display name if not provided
    if (!fieldForm.field_name) {
      fieldForm.field_name = fieldForm.field_display_name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    }

    saveField.mutate(fieldForm);
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
          <CardTitle>Custom Fields</CardTitle>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField ? 'Edit Field' : 'Add New Field'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="field_name">Field Name (Internal)</Label>
                <Input
                  id="field_name"
                  placeholder="customer_name"
                  value={fieldForm.field_name}
                  onChange={(e) => setFieldForm({ ...fieldForm, field_name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Used internally (no spaces, lowercase)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="field_type">Field Type</Label>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="field_display_name">Display Name (English)</Label>
                <Input
                  id="field_display_name"
                  placeholder="Customer Name"
                  value={fieldForm.field_display_name}
                  onChange={(e) => setFieldForm({ ...fieldForm, field_display_name: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="field_display_name_ar">Display Name (Arabic)</Label>
                <Input
                  id="field_display_name_ar"
                  placeholder="اسم العميل"
                  value={fieldForm.field_display_name_ar || ''}
                  onChange={(e) => setFieldForm({ ...fieldForm, field_display_name_ar: e.target.value })}
                  dir="rtl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Extraction Keywords (comma separated)</Label>
              <Input
                id="keywords"
                placeholder="name, customer, client, اسم, عميل"
                value={fieldForm.extraction_keywords?.join(', ') || ''}
                onChange={(e) => setFieldForm({ 
                  ...fieldForm, 
                  extraction_keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                })}
              />
              <p className="text-xs text-muted-foreground">
                Keywords that help AI identify this field in messages
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt_template">Extraction Prompt (Optional)</Label>
              <Textarea
                id="prompt_template"
                placeholder="Extract the customer's full name from the message"
                value={fieldForm.prompt_template || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, prompt_template: e.target.value })}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Custom prompt to help AI extract this specific field
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ask_template">Missing Field Question (Optional)</Label>
              <Textarea
                id="ask_template"
                placeholder="Could you please provide your name?"
                value={fieldForm.ask_if_missing_template || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, ask_if_missing_template: e.target.value })}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Message to send when this field is missing
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_required"
                checked={fieldForm.is_required}
                onCheckedChange={(checked) => setFieldForm({ ...fieldForm, is_required: !!checked })}
              />
              <Label htmlFor="is_required">This field is required</Label>
            </div>
          </div>

          <DialogFooter>
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