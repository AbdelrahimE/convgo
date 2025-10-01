import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  Cog,
  Search,
  Filter,
  TrendingUp,
  MessageSquare,
  Bot,
  UserPlus,
  Star,
  ShoppingBag,
  Heart,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWhatsAppInstances } from '@/hooks/use-whatsapp-instances';
import {
  useCustomerProfilesWithAdvancedSearch,
  type AdvancedSearchFilters
} from '@/hooks/use-customer-profiles';
import { useDebounce } from '@/hooks/use-debounce';
import { CustomerProfileCard, CustomerProfile } from '@/components/customer/CustomerProfileCard';
import { CustomerProfileRow } from '@/components/customer/CustomerProfileRow';
import { VirtualRowContainer } from '@/components/customer/VirtualRowContainer';

export const CustomerProfiles = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [initialPageLoading, setInitialPageLoading] = useState(true);
  const pageSize = 50; // Number of profiles per page
  
  // Debounce search term to improve performance during typing
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Fetch WhatsApp instances
  const { data: instances = [], isLoading: loadingInstances } = useWhatsAppInstances(user?.id);

  // Create filters object for server-side filtering
  const filters: AdvancedSearchFilters = useMemo(() => ({
    searchTerm: debouncedSearchTerm || undefined,
    stageFilter: stageFilter === 'all' ? undefined : stageFilter,
  }), [debouncedSearchTerm, stageFilter]);

  // Fetch customer profiles with advanced server-side search
  const { 
    data: profilesData,
    isLoading: loadingProfiles 
  } = useCustomerProfilesWithAdvancedSearch(selectedInstance, currentPage, pageSize, filters);

  // Extract data from combined response
  const profiles = profilesData?.profiles || [];
  const stats = profilesData?.stats;
  const pagination = profilesData?.pagination;

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, stageFilter, selectedInstance]);

  // Handle initial page loading
  React.useEffect(() => {
    // Set initial page loading to false after a short delay
    const timer = setTimeout(() => {
      setInitialPageLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // No need for client-side filtering anymore - all filtering is done server-side
  const filteredProfiles = profiles;

  // Memoized StatCard component for performance optimization
  const StatCard = React.memo(({ 
    title, 
    value, 
    description, 
    icon: Icon, 
    color 
  }: { 
    title: string; 
    value: string | number; 
    description: string; 
    icon: any; 
    color: string; 
  }) => (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="p-4">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h4 className="text-sm font-medium">{title}</h4>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  ));

  // Memoized row renderer for virtual scrolling
  const renderCustomerRow = useCallback((profile: CustomerProfile, index: number) => (
    <CustomerProfileRow
      key={profile.id}
      profile={profile}
    />
  ), []);

  // Show initial loading state
  if (initialPageLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          {/* Modern animated loader with gradient */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-20 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('customerProfiles.loadingTitle')}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('customerProfiles.loadingDescription')}
            </p>
          </div>
          
          {/* Loading dots animation */}
          <div className="flex space-x-1">
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {t('customerProfiles.title')}
                </h1>
                <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
                  {t('customerProfiles.description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        {/* Instance Selection */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5" />
                {t('customerProfiles.chooseWhatsappNumber')}
              </h2>
            </div>

            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('customerProfiles.chooseWhatsappNumber')} />
              </SelectTrigger>
              <SelectContent>
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    <div className="flex items-center justify-between w-full gap-x-2">
                      <span>{instance.instance_name}</span>
                      <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                        {t('customerProfiles.connected')}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedInstance && (
          <>
            {/* Statistics */}
            {stats && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title={t('customerProfiles.totalCustomers')}
                  value={stats.total}
                  description={t('customerProfiles.allRegisteredCustomers')}
                  icon={Users}
                  color="text-blue-600"
                />
                <StatCard
                  title={t('customerProfiles.newCustomers')}
                  value={stats.stages.new}
                  description={t('customerProfiles.recentlyAddedCustomers')}
                  icon={UserPlus}
                  color="text-green-600"
                />
                <StatCard
                  title={t('customerProfiles.totalMessages')}
                  value={stats.totalMessages}
                  description={t('customerProfiles.avgPerCustomer', { count: stats.avgMessagesPerCustomer })}
                  icon={MessageSquare}
                  color="text-orange-600"
                />
                <StatCard
                  title={t('customerProfiles.aiInteractions')}
                  value={stats.totalInteractions}
                  description={t('customerProfiles.avgPerCustomer', { count: stats.avgInteractionsPerCustomer })}
                  icon={Bot}
                  color="text-purple-600"
                />
              </div>
            )}

            <Tabs defaultValue="profiles" className="space-y-4">
              <TabsList>
                <TabsTrigger value="profiles">{t('customerProfiles.profiles')}</TabsTrigger>
                <TabsTrigger value="analytics">{t('customerProfiles.analytics')}</TabsTrigger>
              </TabsList>

              <TabsContent value="profiles" className="space-y-4">
                {/* Search and Filters */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        {t('customerProfiles.filters')}
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder={t('customerProfiles.searchPlaceholder')}
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                        </div>
                        <Select value={stageFilter} onValueChange={setStageFilter}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder={t('customerProfiles.allStages')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('customerProfiles.allStages')}</SelectItem>
                            <SelectItem value="new">{t('customerProfiles.new')}</SelectItem>
                            <SelectItem value="interested">{t('customerProfiles.interested')}</SelectItem>
                            <SelectItem value="customer">{t('customerProfiles.customer')}</SelectItem>
                            <SelectItem value="loyal">{t('customerProfiles.loyal')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>
                          {pagination ? (
                            filters.searchTerm || filters.stageFilter ? (
                              t('customerProfiles.showingFiltered', {
                                start: ((currentPage - 1) * pageSize) + 1,
                                end: Math.min(currentPage * pageSize, pagination.filtered),
                                filtered: pagination.filtered,
                                total: pagination.total
                              })
                            ) : (
                              t('customerProfiles.showingRange', {
                                start: ((currentPage - 1) * pageSize) + 1,
                                end: Math.min(currentPage * pageSize, pagination.total),
                                total: pagination.total
                              })
                            )
                          ) : (
                            `${t('customerProfiles.showing')} ${filteredProfiles.length} ${t('customerProfiles.customers')}`
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Profiles List */}
                {loadingProfiles ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-muted-foreground">{t('customerProfiles.loadingProfiles')}</p>
                    </div>
                  </div>
                ) : filteredProfiles.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">{t('customerProfiles.noProfilesFound')}</h3>
                      <p className="text-muted-foreground">
                        {searchTerm || stageFilter !== 'all'
                          ? t('customerProfiles.tryAdjustingFilters')
                          : t('customerProfiles.profilesWillAppear')
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {/* Use Virtual Row Container for better performance */}
                    <div style={{ height: '600px' }}> {/* Fixed height for virtual scrolling */}
                      <VirtualRowContainer
                        profiles={filteredProfiles}
                        renderRow={renderCustomerRow}
                        itemsPerPage={12}
                      />
                    </div>
                  </div>
                )}

                {/* Pagination Controls */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {filters.searchTerm || filters.stageFilter ? (
                          t('customerProfiles.showingFiltered', {
                            start: ((currentPage - 1) * pageSize) + 1,
                            end: Math.min(currentPage * pageSize, pagination.filtered),
                            filtered: pagination.filtered,
                            total: pagination.total
                          })
                        ) : (
                          t('customerProfiles.showingRange', {
                            start: ((currentPage - 1) * pageSize) + 1,
                            end: Math.min(currentPage * pageSize, pagination.total),
                            total: pagination.total
                          })
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {t('customerProfiles.previous')}
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                            let pageNum;
                            if (pagination.totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= pagination.totalPages - 2) {
                              pageNum = pagination.totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(pageNum)}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage === pagination.totalPages}
                        >
                          {t('customerProfiles.next')}
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
            </TabsContent>

              <TabsContent value="analytics" className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="p-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        {t('customerProfiles.customerAnalytics')}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {t('customerProfiles.insightsDescription')}
                      </p>
                    </div>
                    {stats ? (
                      <div className="space-y-6">
                        {/* Stage Distribution */}
                        <div>
                          <h4 className="text-sm font-medium mb-3">{t('customerProfiles.stageDistribution')}</h4>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* New Customers */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="p-4">
                                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                  <h4 className="text-sm font-medium">{t('customerProfiles.new')}</h4>
                                  <UserPlus className="h-4 w-4 text-blue-600" />
                                </div>
                                <div className="text-2xl font-bold text-blue-600">{stats.stages.new}</div>
                                <p className="text-xs text-muted-foreground">{t('customerProfiles.newCustomersLabel')}</p>
                              </div>
                            </div>

                            {/* Interested Customers */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="p-4">
                                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                  <h4 className="text-sm font-medium">{t('customerProfiles.interested')}</h4>
                                  <Star className="h-4 w-4 text-orange-600" />
                                </div>
                                <div className="text-2xl font-bold text-orange-600">{stats.stages.interested}</div>
                                <p className="text-xs text-muted-foreground">{t('customerProfiles.interestedProspects')}</p>
                              </div>
                            </div>

                            {/* Customers */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="p-4">
                                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                  <h4 className="text-sm font-medium">{t('customerProfiles.customer')}</h4>
                                  <ShoppingBag className="h-4 w-4 text-green-600" />
                                </div>
                                <div className="text-2xl font-bold text-green-600">{stats.stages.customer}</div>
                                <p className="text-xs text-muted-foreground">{t('customerProfiles.activeCustomers')}</p>
                              </div>
                            </div>

                            {/* Loyal Customers */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="p-4">
                                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                  <h4 className="text-sm font-medium">{t('customerProfiles.loyal')}</h4>
                                  <Heart className="h-4 w-4 text-purple-600" />
                                </div>
                                <div className="text-2xl font-bold text-purple-600">{stats.stages.loyal}</div>
                                <p className="text-xs text-muted-foreground">{t('customerProfiles.loyalCustomers')}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Engagement Metrics */}
                        <div>
                          <h4 className="text-sm font-medium mb-3">{t('customerProfiles.engagementMetrics')}</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Average Messages */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="p-4">
                                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                  <h4 className="text-sm font-medium">{t('customerProfiles.avgMessages')}</h4>
                                  <MessageSquare className="h-4 w-4 text-orange-600" />
                                </div>
                                <div className="text-2xl font-bold text-orange-600">{stats.avgMessagesPerCustomer}</div>
                                <p className="text-xs text-muted-foreground">{t('customerProfiles.perCustomer')}</p>
                              </div>
                            </div>

                            {/* Average AI Interactions */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                              <div className="p-4">
                                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                                  <h4 className="text-sm font-medium">{t('customerProfiles.avgAiInteractions')}</h4>
                                  <Bot className="h-4 w-4 text-purple-600" />
                                </div>
                                <div className="text-2xl font-bold text-purple-600">{stats.avgInteractionsPerCustomer}</div>
                                <p className="text-xs text-muted-foreground">{t('customerProfiles.perCustomer')}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                        <p className="mt-2 text-muted-foreground">{t('customerProfiles.loadingAnalytics')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};