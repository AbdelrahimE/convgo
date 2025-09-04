import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, ExternalLink, Info } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface SheetSelectorProps {
  configId: string;
  currentSheetId?: string;
  sheetName?: string;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({ 
  configId, 
  currentSheetId, 
  sheetName 
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sheetId, setSheetId] = useState(currentSheetId || '');
  const [newSheetName, setNewSheetName] = useState(sheetName || 'Sheet1');

  const updateSheet = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('google_sheets_config')
        .update({ 
          google_sheet_id: sheetId,
          sheet_name: newSheetName 
        })
        .eq('id', configId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-sheets-config'] });
      toast({
        title: "Success",
        description: "Google Sheet settings updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    }
  });

  const extractSheetId = (input: string) => {
    // Extract sheet ID from URL or use as-is
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input;
  };

  const handleSave = () => {
    const extractedId = extractSheetId(sheetId);
    setSheetId(extractedId);
    updateSheet.mutate();
  };

  const openSheet = () => {
    if (currentSheetId) {
      window.open(`https://docs.google.com/spreadsheets/d/${currentSheetId}`, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Provide either the Google Sheet URL or Sheet ID. The data will be exported to this sheet.
          Make sure the sheet is accessible by your Google account.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="sheet-id">Google Sheet URL or ID</Label>
        <Input
          id="sheet-id"
          placeholder="https://docs.google.com/spreadsheets/d/1abc... or 1abc..."
          value={sheetId}
          onChange={(e) => setSheetId(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Paste the full Google Sheets URL or just the Sheet ID
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sheet-name">Sheet Tab Name</Label>
        <Input
          id="sheet-name"
          placeholder="Sheet1"
          value={newSheetName}
          onChange={(e) => setNewSheetName(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          The name of the specific tab in your Google Sheet (default: Sheet1)
        </p>
      </div>

      <div className="flex gap-2">
        <Button 
          onClick={handleSave}
          disabled={!sheetId || updateSheet.isPending}
          className="flex-1"
        >
          {updateSheet.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
        
        {currentSheetId && (
          <Button 
            onClick={openSheet}
            variant="outline"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Sheet
          </Button>
        )}
      </div>

      {currentSheetId && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <CardDescription>
              <strong>Current Sheet ID:</strong> {currentSheetId}
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SheetSelector;