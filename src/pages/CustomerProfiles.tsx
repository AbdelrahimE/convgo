import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Users, 
  Search, 
  Filter,
  TrendingUp,
  MessageSquare,
  Bot,
  UserPlus
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWhatsAppInstances } from '@/hooks/use-whatsapp-instances';
import { 
  useCustomerProfiles, 
  useCustomerProfilesStats 
} from '@/hooks/use-customer-profiles';
import { CustomerProfileCard, CustomerProfile } from '@/components/customer/CustomerProfileCard';

export const CustomerProfiles = () => {
  const { user } = useAuth();
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  // Fetch WhatsApp instances
  const { data: instances = [], isLoading: loadingInstances } = useWhatsAppInstances(user?.id);

  // Fetch customer profiles for selected instance
  const { data: profiles = [], isLoading: loadingProfiles } = useCustomerProfiles(selectedInstance);

  // Fetch customer profile statistics
  const { data: stats } = useCustomerProfilesStats(selectedInstance);

  // Filter profiles based on search and stage
  const filteredProfiles = profiles.filter((profile: CustomerProfile) => {
    const matchesSearch = !searchTerm || 
      profile.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.phone_number.includes(searchTerm) ||
      profile.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.company?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStage = stageFilter === 'all' || profile.customer_stage === stageFilter;

    return matchesSearch && matchesStage;
  });

  const StatCard = ({ 
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Customer Profiles</h1>
          <p className="text-muted-foreground mt-1">
            Manage and view detailed customer information and conversation history
          </p>
        </div>
      </div>

      {/* Instance Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Choose WhatsApp Number</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedInstance} onValueChange={setSelectedInstance}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose WhatsApp Number" />
            </SelectTrigger>
            <SelectContent>
              {instances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.instance_name}
                  <Badge 
                    variant={instance.status === 'connected' ? 'default' : 'secondary'}
                    className="ml-2"
                  >
                    {instance.status}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedInstance && (
        <>
          {/* Statistics */}
          {stats && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total Customers"
                value={stats.total}
                description="All registered customers"
                icon={Users}
                color="text-blue-600"
              />
              <StatCard
                title="New Customers"
                value={stats.stages.new}
                description="Recently added customers"
                icon={UserPlus}
                color="text-green-600"
              />
              <StatCard
                title="Total Messages"
                value={stats.totalMessages}
                description={`Avg ${stats.avgMessagesPerCustomer} per customer`}
                icon={MessageSquare}
                color="text-orange-600"
              />
              <StatCard
                title="AI Interactions"
                value={stats.totalInteractions}
                description={`Avg ${stats.avgInteractionsPerCustomer} per customer`}
                icon={Bot}
                color="text-purple-600"
              />
            </div>
          )}

          <Tabs defaultValue="profiles" className="space-y-4">
            <TabsList>
              <TabsTrigger value="profiles">Customer Profiles</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="profiles" className="space-y-4">
              {/* Search and Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by name, phone, email, or company..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <Select value={stageFilter} onValueChange={setStageFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Stages</SelectItem>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="interested">Interested</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="loyal">Loyal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Showing {filteredProfiles.length} of {profiles.length} customers</span>
                  </div>
                </CardContent>
              </Card>

              {/* Customer Profiles Grid */}
              {loadingProfiles ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-muted-foreground">Loading customer profiles...</p>
                </div>
              ) : filteredProfiles.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No Customer Profiles Found</h3>
                    <p className="text-muted-foreground">
                      {searchTerm || stageFilter !== 'all' 
                        ? 'Try adjusting your search or filters'
                        : 'Customer profiles will appear here as customers interact with your WhatsApp AI'
                      }
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredProfiles.map((profile: CustomerProfile) => (
                    <CustomerProfileCard
                      key={profile.id}
                      profile={profile}
                      onEdit={() => {
                        // TODO: Implement edit functionality
                        console.log('Edit profile:', profile.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Customer Analytics
                  </CardTitle>
                  <CardDescription>
                    Insights about your customer base and engagement
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats ? (
                    <div className="space-y-6">
                      {/* Stage Distribution */}
                      <div>
                        <h4 className="text-sm font-medium mb-3">Customer Stage Distribution</h4>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{stats.stages.new}</div>
                            <div className="text-sm text-blue-600">New</div>
                          </div>
                          <div className="bg-yellow-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-yellow-600">{stats.stages.interested}</div>
                            <div className="text-sm text-yellow-600">Interested</div>
                          </div>
                          <div className="bg-green-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{stats.stages.customer}</div>
                            <div className="text-sm text-green-600">Customer</div>
                          </div>
                          <div className="bg-purple-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">{stats.stages.loyal}</div>
                            <div className="text-sm text-purple-600">Loyal</div>
                          </div>
                        </div>
                      </div>

                      {/* Engagement Metrics */}
                      <div>
                        <h4 className="text-sm font-medium mb-3">Engagement Metrics</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-orange-50 p-4 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-2xl font-bold text-orange-600">
                                  {stats.avgMessagesPerCustomer}
                                </div>
                                <div className="text-sm text-orange-600">Avg Messages per Customer</div>
                              </div>
                              <MessageSquare className="h-8 w-8 text-orange-600" />
                            </div>
                          </div>
                          <div className="bg-purple-50 p-4 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-2xl font-bold text-purple-600">
                                  {stats.avgInteractionsPerCustomer}
                                </div>
                                <div className="text-sm text-purple-600">Avg AI Interactions per Customer</div>
                              </div>
                              <Bot className="h-8 w-8 text-purple-600" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <p className="mt-2 text-muted-foreground">Loading analytics...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};