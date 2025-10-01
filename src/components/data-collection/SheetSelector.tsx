import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, ExternalLink, Info } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      toast.success(t('dataCollection.dataExportedSuccessfully'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('dataCollection.failedToExportData'));
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
      <div className="space-y-2">
        <Label htmlFor="sheet-id">{t('dataCollection.googleSheetUrlOrId')}</Label>
        <Input
          id="sheet-id"
          placeholder="https://docs.google.com/spreadsheets/d/1abc... or 1abc..."
          value={sheetId}
          onChange={(e) => setSheetId(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          {t('dataCollection.pasteGoogleSheetUrl')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sheet-name">{t('dataCollection.sheetTabName')}</Label>
        <Input
          id="sheet-name"
          placeholder="Sheet1"
          value={newSheetName}
          onChange={(e) => setNewSheetName(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          {t('dataCollection.sheetTabNameDescription')}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={!sheetId || updateSheet.isPending}
          className="flex-1"
        >
          {updateSheet.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <Save className="h-4 w-4" />
          {t('dataCollection.saveSettings')}
        </Button>

        {currentSheetId && (
          <Button
            onClick={openSheet}
            variant="outline"
          >
            <ExternalLink className="h-4 w-4" />
            {t('dataCollection.openSheet')}
          </Button>
        )}
      </div>

      {currentSheetId && (
        <Card className="bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
          <CardContent className="pt-3 pb-3 px-3">
            <CardDescription className="text-sm text-blue-900">
              {t('dataCollection.currentSheetId', { id: currentSheetId })}
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SheetSelector;