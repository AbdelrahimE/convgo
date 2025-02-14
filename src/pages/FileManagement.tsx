
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { FileUploader } from "@/components/FileUploader";
import { FileList } from "@/components/FileList";

export default function FileManagement() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold md:text-3xl">File Management</h1>
          <FileUploader />
        </div>
        <FileList />
      </div>
    </div>
  );
}
