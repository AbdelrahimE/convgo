import React, { useEffect, useState } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge, Calendar, Activity, AlertCircle } from "lucide-react";
import { format, addDays, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { useAIResponse } from "@/hooks/use-ai-response";
import logger from '@/utils/logger';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { getGaugeColor } from '@/utils/gauge-utils';

interface UsageData {
  allowed: boolean;
  limit: number;
  used: number;
  resetsOn: string | null;
}

const calculateTimeUntilReset = (resetDate: string | null): { days: number; hours: number; minutes: number; } | null => {
  if (!resetDate) return null;
  
  const resetDateTime = new Date(resetDate);
  const nextResetDate = addDays(resetDateTime, 30);
  const now = new Date();

  if (now > nextResetDate) {
    return null;
  }

  const days = differenceInDays(nextResetDate, now);
  const hours = differenceInHours(nextResetDate, now) % 24;
  const minutes = differenceInMinutes(nextResetDate, now) % 60;

  return { days, hours, minutes };
};

export default function AIUsageMonitoring() {
  const {
    user
  } = useAuth();
  const {
    checkAIUsageLimit
  } = useAIResponse();
  const [isLoading, setIsLoading] = useState(true);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeUntilReset, setTimeUntilReset] = useState<{ days: number; hours: number; minutes: number; } | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user) {
      fetchUsageData();
    } else {
      setIsLoading(false);
      setErrorMessage("User authentication required");
    }
  }, [user]);

  useEffect(() => {
    if (usageData?.resetsOn) {
      const updateTimeUntilReset = () => {
        setTimeUntilReset(calculateTimeUntilReset(usageData.resetsOn));
      };
      
      updateTimeUntilReset();
      
      const interval = setInterval(updateTimeUntilReset, 60000);
      
      return () => clearInterval(interval);
    }
  }, [usageData?.resetsOn]);

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
        throw new Error("Failed to fetch usage data - empty response");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "An unexpected error occurred";
      logger.error("Error fetching AI usage data:", errorMsg);
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
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
    return <motion.div initial={{
      opacity: 0,
      y: 20
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      duration: 0.3
    }} className="container mx-auto px-4 py-8 max-w-7xl">
        <motion.h1 initial={{
        opacity: 0,
        x: -20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        delay: 0.2
      }} className="text-2xl text-left md:text-3xl font-semibold lg:text-4xl mb-8">
          AI Usage Monitoring
        </motion.h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>
            You must be logged in to view your AI usage data.
          </AlertDescription>
        </Alert>
      </motion.div>;
  }

  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    duration: 0.3
  }} className="container mx-auto px-4 py-8 max-w-7xl">
      <motion.h1 initial={{
      opacity: 0,
      x: -20
    }} animate={{
      opacity: 1,
      x: 0
    }} transition={{
      delay: 0.2
    }} className="text-2xl text-left md:text-3xl font-semibold lg:text-4xl mb-8">
        AI Usage Monitoring
      </motion.h1>
      
      {isLoading ? <div className="grid gap-8">
          <motion.div initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.3
      }}>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Card key={i} className="shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <Skeleton className="h-6 w-40 mb-2" />
                    <Skeleton className="h-4 w-60" />
                  </CardHeader>
                  <CardContent className="flex flex-col items-center pt-4">
                    <Skeleton className="h-48 w-48 rounded-full" />
                  </CardContent>
                  <CardFooter className="flex flex-col items-center text-center pt-0">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </CardFooter>
                </Card>)}
            </div>
          </motion.div>
        </div> : errorMessage ? <motion.div initial={{
      opacity: 0,
      y: 20
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      delay: 0.3
    }} className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Usage Data</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
          <Button onClick={fetchUsageData}>Retry</Button>
        </motion.div> : usageData ? <div className="grid gap-8">
          <motion.div initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.3
      }}>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              <Card className="shadow-md transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-semibold text-left">
                    <Gauge className="h-5 w-5 text-primary" />
                    AI Response Usage
                  </CardTitle>
                  <CardDescription>Current usage of your monthly allocation</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex flex-col items-center">
                    <div className="relative flex items-center justify-center w-48 h-48">
                      <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle className="text-muted-foreground/20" strokeWidth="10" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
                        <circle className={getGaugeColor(percentageUsed)} strokeWidth="10" strokeDasharray={`${percentageUsed * 2.51} 251.2`} strokeLinecap="round" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" transform="rotate(-90 50 50)" />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-semibold">{Math.round(percentageUsed)}%</span>
                        <span className="text-sm text-muted-foreground">used</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col items-center text-center pt-0">
                  <p className="text-lg font-semibold text-center">
                    <span className="font-semibold">{usageData.used.toLocaleString()}</span> of <span className="font-semibold">{usageData.limit.toLocaleString()}</span> AI responses used
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {usageData.allowed ? "Your usage is within limits" : "You've reached your monthly limit"}
                  </p>
                </CardFooter>
              </Card>

              <Card className="shadow-md transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-semibold text-left">
                    <Calendar className="h-5 w-5 text-primary" />
                    Next Reset Date
                  </CardTitle>
                  <CardDescription>When your allocation will be reset</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center pt-4">
                  <div className="bg-muted w-24 h-24 rounded-full flex items-center justify-center mb-4">
                    <div className="text-center">
                      {resetsOnDate ? (
                        <>
                          <div className="text-2xl font-bold">
                            {format(addDays(resetsOnDate, 30), 'd')}
                          </div>
                          <div className="text-sm font-medium">
                            {format(addDays(resetsOnDate, 30), 'MMM')}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm font-medium">Not set</div>
                      )}
                    </div>
                  </div>
                  {resetsOnDate && timeUntilReset && (
                    <p className="text-center">
                      Your usage limit will reset in{' '}
                      <span>
                        {timeUntilReset.days} days, {timeUntilReset.hours} hours, and{' '}
                        {timeUntilReset.minutes} minutes
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-md transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-semibold text-left">
                    <Activity className="h-5 w-5 text-primary" />
                    Usage Details
                  </CardTitle>
                  <CardDescription>Detailed breakdown of your usage</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Allocation:</span>
                      <span className="font-medium">{usageData.limit.toLocaleString()} responses</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Used:</span>
                      <span className="font-medium">{usageData.used.toLocaleString()} responses</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Remaining:</span>
                      <span className="font-medium">{(usageData.limit - usageData.used).toLocaleString()} responses</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status:</span>
                      <span className={`font-medium ${usageData.allowed ? "text-emerald-500" : "text-red-500"}`}>
                        {usageData.allowed ? "Active" : "Limit Reached"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div> : <motion.div initial={{
      opacity: 0,
      y: 20
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      delay: 0.3
    }}>
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
        </motion.div>}
    </motion.div>;
}
