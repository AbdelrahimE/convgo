
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Database, MessageSquare } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xl">File Management</CardTitle>
          <FileText className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            Upload, manage and process your documents for AI integration.
          </CardDescription>
          <Button onClick={() => navigate("/files")} variant="outline" className="w-full">
            Manage Files
          </Button>
        </CardContent>
      </Card>

      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xl">Metadata</CardTitle>
          <Database className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            Configure and manage metadata fields for your documents.
          </CardDescription>
          <Button onClick={() => navigate("/metadata")} variant="outline" className="w-full">
            Manage Metadata
          </Button>
        </CardContent>
      </Card>

      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xl">WhatsApp Integration</CardTitle>
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4">
            Connect and manage your WhatsApp integration for AI responses.
          </CardDescription>
          <Button onClick={() => navigate("/whatsapp")} variant="outline" className="w-full">
            WhatsApp Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
