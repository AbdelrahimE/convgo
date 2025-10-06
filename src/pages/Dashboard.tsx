import { useEffect, useState } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Gauge, AlertCircle, HardDrive, Server, Crown, HeartHandshake, CirclePlus, LayoutDashboard, RefreshCw } from "lucide-react";
import { format, addDays, differenceInDays } from 'date-fns';
import { useAIResponse } from "@/hooks/use-ai-response";
import { useWhatsAppInstances } from "@/hooks/use-whatsapp-instances";
import logger from '@/utils/logger';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from 'react-i18next';

interface UsageData {
  allowed: boolean;
  limit: number;
  used: number;
  resetsOn: string | null;
  storageLimitMb?: number;
  instanceLimit?: number;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  planType?: string;
  subscriptionPeriod?: string;
}

interface ProfileData {
  full_name: string | null;
  business_name: string | null;
  is_active: boolean | null;
}

const calculateDaysRemaining = (endDate: string | null): number | null => {
  if (!endDate) return null;

  const end = new Date(endDate);
  const now = new Date();
  const days = differenceInDays(end, now);

  return days >= 0 ? days : 0;
};

export default function Dashboard() {
  const {
    user
  } = useAuth();
  const { t } = useTranslation();
  const {
    checkAIUsageLimit
  } = useAIResponse();
  const { data: instances } = useWhatsAppInstances(user?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      // Fetch both data in parallel for better performance and reduced API calls
      Promise.all([
        fetchUsageData(),
        fetchProfileData()
      ]).catch(err => {
        logger.error("Error loading dashboard data:", err);
        setErrorMessage("Failed to load dashboard data");
      });
    } else {
      setIsLoading(false);
      setErrorMessage("User authentication required");
    }
  }, [user]);

  const fetchUsageData = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      logger.log("Fetching AI usage data...");
      const result = await checkAIUsageLimit();
      logger.log("AI usage data response:", result);
      if (result) {
        setUsageData(result);
        logger.log("AI usage data set successfully:", result);
      } else {
        throw new Error("Failed to fetch your data - empty response");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "An unexpected error occurred";
      logger.error("Error fetching AI usage data:", errorMsg);
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfileData = async () => {
    try {
      if (!user?.id) return;

      logger.log("Fetching profile data...");
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, business_name, is_active')
        .eq('id', user.id)
        .single();

      if (error) {
        logger.error("Error fetching profile data:", error);
        return;
      }

      if (data) {
        setProfileData(data);
        logger.log("Profile data set successfully:", data);
      }
    } catch (error) {
      logger.error("Error fetching profile data:", error);
    }
  };

  const calculatePercentageUsed = () => {
    if (!usageData || usageData.limit === 0) return 0;
    const percentage = usageData.used / usageData.limit * 100;
    return Math.min(percentage, 100); // Ensure we don't exceed 100%
  };

  const percentageUsed = calculatePercentageUsed();
  const resetsOnDate = usageData?.resetsOn ? new Date(usageData.resetsOn) : null;

  if (!user) {
    return <div className="w-full min-h-screen bg-white dark:bg-slate-900">
        {/* Header Section */}
        <div className="bg-white dark:bg-slate-900">
          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2">
            <div className="flex-1">
              <h1 className="flex items-center gap-2 text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                <LayoutDashboard className="h-7 w-7 md:h-8 md:w-8" />
                {t('dashboard.title')}
              </h1>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication Required</AlertTitle>
            <AlertDescription>
              You must be logged in to view your dashboard.
            </AlertDescription>
          </Alert>
        </div>
      </div>;
  }

  const userName = profileData?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const businessName = profileData?.business_name;
  const daysRemaining = calculateDaysRemaining(usageData?.subscriptionEndDate || null);

  return <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                <LayoutDashboard className="h-8 w-8 text-slate-900" />
                {t('dashboard.title')}
              </h1>
            </div>
            {/* Manual Refresh Button - better control than auto-refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchUsageData();
                fetchProfileData();
              }}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? t('dashboard.refreshing', 'Refreshing...') : t('dashboard.refresh', 'Refresh')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">

        {isLoading ? (
          <div className="space-y-4">
            {/* Quick Stats Skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map(i =>
                <Card key={i} className="bg-white shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                    <Skeleton className="h-9 w-32 mb-3" />
                    <Skeleton className="h-1.5 w-full mb-2" />
                    <Skeleton className="h-3 w-16" />
                  </CardContent>
                </Card>
              )}
            </div>
            {/* Main Content Skeleton */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 bg-white shadow-sm">
                <CardHeader className="border-b">
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent className="pt-6">
                  <Skeleton className="h-80 w-full" />
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card className="bg-white shadow-sm">
                  <CardHeader className="border-b">
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </CardHeader>
                  <CardContent className="pt-6">
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
                <Card className="bg-white shadow-sm">
                  <CardHeader className="border-b">
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </CardHeader>
                  <CardContent className="pt-6">
                    <Skeleton className="h-40 w-full" />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : errorMessage ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Loading Data</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
            <Button onClick={fetchUsageData}>Retry</Button>
          </div>
        ) : usageData ? (
          <div className="space-y-4">
            {/* First Row - Welcome Card & Subscription */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Welcome Card */}
              <Card className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white shadow-sm border-0">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="mb-3">
                    <HeartHandshake className="h-8 w-8" />
                  </div>

                  <div className="flex-1 flex items-center">
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold">👋 Welcome to ConvGo,</h3>
                      <p className="text-2xl font-bold">{userName}</p>
                      {businessName && (
                        <p className="text-sm">Company: {businessName}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-sm">WhatsApp Status:</span>
                        {instances && instances.length > 0 && instances.some(i => i.status === 'Connected') ? (
                          <span className="text-sm font-medium">Connected</span>
                        ) : (
                          <span className="text-sm font-medium">Disconnected</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-white hover:bg-white/90 text-blue-600 hover:text-blue-700 mt-4"
                    onClick={() => window.location.href = '/whatsapp'}
                  >
                    <CirclePlus className="h-4 w-4" />
                    Add WhatsApp Number
                  </Button>
                </CardContent>
              </Card>

              {/* Subscription Details Card */}
              <Card className="bg-gradient-to-br from-green-950 to-green-800 dark:from-green-900 dark:to-green-900 text-white shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Crown className="h-8 w-8 text-green-400" />
                      <h3 className="text-xl font-bold text-green-400">Subscription Details</h3>
                    </div>
                    <Badge
                      variant={(daysRemaining || 0) > 0 ? "default" : "destructive"}
                      className="text-sm px-3 py-1 bg-green-400 text-green-950 hover:bg-green-500 rounded-lg"
                    >
                      {(daysRemaining || 0) > 0 ? 'Active' : 'Expired'}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-white mb-4">
                    <div className="flex justify-between text-sm font-normal">
                      <span className="opacity-90">Plan Type</span>
                      <span className="opacity-90">{usageData.planType || 'Launch'}</span>
                    </div>
                    <div className="flex justify-between text-sm font-normal">
                      <span className="opacity-90">Billing</span>
                      <span className="opacity-90">{usageData.subscriptionPeriod || 'Monthly'}</span>
                    </div>
                    <div className="flex justify-between text-sm font-normal">
                      <span className="opacity-90">Starts On</span>
                      <span className="opacity-90">
                        {usageData.subscriptionStartDate
                          ? format(new Date(usageData.subscriptionStartDate), 'yyyy-MM-dd')
                          : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-normal">
                      <span className="opacity-90">Expires On</span>
                      <span className="opacity-90">
                        {usageData.subscriptionEndDate
                          ? format(new Date(usageData.subscriptionEndDate), 'yyyy-MM-dd')
                          : 'Not set'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="opacity-90">Days Left</span>
                      <span className="opacity-90 font-semibold">
                        {daysRemaining !== null ? daysRemaining : 0}
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-green-400 hover:bg-green-500 text-green-950 hover:text-white"
                    onClick={() => {
                      window.open('https://www.youtube.com/watch?v=F6TzZDHOCBU&list=RDfkeO8shNkf0&index=3', '_blank');
                    }}
                  >
                    <Crown className="h-4 w-4" />
                    Upgrade Plan
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Second Row - Three Quick Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* AI Usage Quick Stat */}
              <Card className="bg-blue-50 border-blue-300 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium text-blue-600">AI Response Usage</span>
                    <Gauge className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-xl font-semibold text-blue-600 mb-3">
                    {usageData.used.toLocaleString()}/{usageData.limit.toLocaleString()}
                  </div>
                  <Progress value={percentageUsed} className="h-2.5 mb-2 [&>div]:bg-blue-500" />
                  <p className="text-xs text-blue-600">
                    {(usageData.limit - usageData.used).toLocaleString()} responses remaining. Reset on {resetsOnDate ? format(addDays(resetsOnDate, 30), 'yyyy-MM-dd') : 'N/A'}
                  </p>
                </CardContent>
              </Card>

              {/* Storage Quick Stat */}
              <Card className="bg-amber-50 border-amber-300 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium text-amber-600">Storage Usage</span>
                    <HardDrive className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="text-xl font-semibold text-amber-600 mb-3">
                    {usageData.storageLimitMb || 50} MB
                  </div>
                  <Progress value={50} className="h-2.5 mb-2 [&>div]:bg-amber-500" />
                  <p className="text-xs text-amber-600">Available</p>
                </CardContent>
              </Card>

              {/* Instances Quick Stat */}
              <Card className="bg-green-50 border-green-300 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium text-green-600">Connected Numbers</span>
                    <Server className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="text-xl font-semibold text-green-600 mb-3">
                    {instances?.length || 0}/{usageData.instanceLimit || 1}
                  </div>
                  <Progress value={((instances?.length || 0) / (usageData.instanceLimit || 1)) * 100} className="h-2.5 mb-2 [&>div]:bg-green-500" />
                  <p className="text-xs text-green-600">
                    {(usageData.instanceLimit || 1) - (instances?.length || 0)} WhatsApp Number Available
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No Data Available</AlertTitle>
              <AlertDescription>
                No usage data is available for your account.
                <Button variant="link" onClick={fetchUsageData} className="p-0 h-auto ml-2">
                  Refresh
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>;
}
