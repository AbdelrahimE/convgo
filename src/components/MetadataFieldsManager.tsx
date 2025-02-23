import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MetadataField, MetadataFieldType } from "@/types/metadata";

export function MetadataFieldsManager() {
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<MetadataField | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFields = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('metadata_fields')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error fetching metadata fields",
        description: error.message
      });
      return;
    }

    const transformedFields: MetadataField[] = (data || []).map(field => ({
      ...field,
      options: field.options ? (typeof field.options === 'string' ? 
        JSON.parse(field.options) : field.options) as { label: string; value: string }[]
        : undefined
    }));

    setFields(transformedFields);
  };

  useEffect(() => {
    fetchFields();
  }, [user]);

  const handleSaveField = async (field: Partial<MetadataField>) => {
    if (!user) return;

    try {
      const isEditing = Boolean(field.id);
      
      if (isEditing) {
        const { error } = await supabase
          .from('metadata_fields')
          .update({ ...field })
          .eq('id', field.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('metadata_fields')
          .insert({
            ...field,
            profile_id: user.id
          });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Metadata field ${isEditing ? 'updated' : 'created'} successfully`
      });

      setIsDialogOpen(false);
      setEditingField(null);
      fetchFields();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error saving metadata field",
        description: error.message
      });
    }
  };

  const handleDeleteField = async (id: string) => {
    try {
      const { error } = await supabase
        .from('metadata_fields')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Metadata field deleted successfully"
      });

      fetchFields();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error deleting metadata field",
        description: error.message
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Metadata Fields</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingField(null)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingField ? 'Edit Metadata Field' : 'Add Metadata Field'}
              </DialogTitle>
            </DialogHeader>
            <MetadataFieldForm
              field={editingField}
              onSave={handleSaveField}
              onCancel={() => {
                setIsDialogOpen(false);
                setEditingField(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {fields.map((field) => (
          <div
            key={field.id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div>
              <h3 className="font-medium">{field.name}</h3>
              <p className="text-sm text-muted-foreground">
                {field.description || 'No description'}
              </p>
              <div className="flex gap-2 mt-1">
                <span className="text-xs bg-secondary px-2 py-1 rounded">
                  {field.field_type}
                </span>
                {field.is_required && (
                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                    Required
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingField(field);
                  setIsDialogOpen(true);
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteField(field.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No metadata fields defined yet
          </div>
        )}
      </div>
    </div>
  );
}

interface MetadataFieldFormProps {
  field: MetadataField | null;
  onSave: (field: Partial<MetadataField>) => void;
  onCancel: () => void;
}

function MetadataFieldForm({ field, onSave, onCancel }: MetadataFieldFormProps) {
  const [name, setName] = useState(field?.name || '');
  const [description, setDescription] = useState(field?.description || '');
  const [fieldType, setFieldType] = useState<MetadataFieldType>(field?.field_type || 'text');
  const [isRequired, setIsRequired] = useState(field?.is_required || false);
  const [options, setOptions] = useState<string>(
    field?.options ? JSON.stringify(field.options, null, 2) : '[]'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const parsedOptions = fieldType === 'select' ? JSON.parse(options) : undefined;
      
      onSave({
        id: field?.id,
        name,
        description,
        field_type: fieldType,
        is_required: isRequired,
        options: parsedOptions
      });
    } catch (error: any) {
      console.error('Error parsing options:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fieldType">Field Type</Label>
        <Select value={fieldType} onValueChange={(value: MetadataFieldType) => setFieldType(value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select field type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
            <SelectItem value="select">Select</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fieldType === 'select' && (
        <div className="space-y-2">
          <Label htmlFor="options">Options (JSON array of objects with label and value)</Label>
          <textarea
            id="options"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className="w-full h-32 p-2 border rounded"
            placeholder='[{"label": "Option 1", "value": "option1"}]'
          />
        </div>
      )}

      <div className="flex items-center space-x-2">
        <Switch
          id="required"
          checked={isRequired}
          onCheckedChange={setIsRequired}
        />
        <Label htmlFor="required">Required field</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          <Save className="w-4 h-4 mr-2" />
          Save Field
        </Button>
      </div>
    </form>
  );
}
