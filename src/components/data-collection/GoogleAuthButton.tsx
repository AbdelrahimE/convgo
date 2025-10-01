import React from 'react';
import { Button } from "@/components/ui/button";
import { FcGoogle } from "react-icons/fc";
import { useTranslation } from 'react-i18next';

interface GoogleAuthButtonProps {
  onClick: () => void;
  isLoading?: boolean;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ onClick, isLoading = false }) => {
  const { t } = useTranslation();

  return (
    <Button
      onClick={onClick}
      disabled={isLoading}
      size="lg"
      className="w-full"
      variant="outline"
    >
      <FcGoogle className="h-5 w-5 mr-2" />
      {t('dataCollection.connectWithGoogle')}
    </Button>
  );
};

export default GoogleAuthButton;