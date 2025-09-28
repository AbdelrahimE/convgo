import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Cog, MessageCircle, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useWhatsAppInstances, EscalatedConversation } from '@/hooks/use-escalation-queries'
import { useResolveEscalationDialog } from '@/hooks/use-resolve-escalation-dialog'
import { ConversationDialog } from '@/components/escalation/ConversationDialog'
import { Badge } from '@/components/ui/badge'

// Lazy load components for better performance
const SettingsTab = lazy(() => import('@/components/escalation/SettingsTab').then(module => ({ default: module.SettingsTab })))
const ConversationsTab = lazy(() => import('@/components/escalation/ConversationsTab').then(module => ({ default: module.ConversationsTab })))

// Loading spinner component
const LoadingSpinner = () => (
  <div className="text-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
    <p className="mt-2 text-slate-600 dark:text-slate-400">Loading...</p>
  </div>
)

export default function EscalationManagement() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('settings')
  const [selectedInstance, setSelectedInstance] = useState<string>('')
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active')
  const [selectedConversation, setSelectedConversation] = useState<EscalatedConversation | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [initialPageLoading, setInitialPageLoading] = useState(true)

  // Use TanStack Query hook for instances
  const { data: instances = [] } = useWhatsAppInstances(user?.id)

  // Use unified resolve escalation hook
  const { handleResolve, isLoading: resolveLoading } = useResolveEscalationDialog({
    onSuccess: () => {
      setShowContext(false)
      setSelectedConversation(null)
    }
  })

  // Set initial instance when instances are loaded
  useEffect(() => {
    if (instances && instances.length > 0 && !selectedInstance) {
      setSelectedInstance(instances[0].id)
    }
  }, [instances, selectedInstance])

  // Handle initial page loading
  useEffect(() => {
    if (user) {
      // Set initial page loading to false after a short delay
      const timer = setTimeout(() => {
        setInitialPageLoading(false)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [user])

  // Memoized reason badge function
  const getReasonBadge = useCallback((reason: string) => {
    switch (reason) {
      case 'ai_detected_intent':
        return <Badge className="bg-purple-100 hover:bg-purple-200 text-purple-800 font-medium">Smart AI Detection</Badge>
      case 'user_request':
        return <Badge className="bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium">Keyword Triggered</Badge>
      default:
        return <Badge className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium">Unknown Reason</Badge>
    }
  }, [])

  // Handle view context
  const handleViewContext = useCallback((conversation: EscalatedConversation) => {
    setSelectedConversation(conversation)
    setShowContext(true)
  }, [])

  // Handle resolve escalation - now using unified hook
  const handleResolveEscalation = useCallback((conversationId: string, whatsappNumber: string, instanceId: string) => {
    handleResolve(conversationId, whatsappNumber, instanceId)
  }, [handleResolve])

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
              <Settings className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          
          {/* Loading text with animation */}
          <div className="loading-text-center space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Loading Escalation Management
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Please wait while we prepare your escalation settings...
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
    )
  }

  return (
    <div className="w-full min-h-screen bg-white dark:bg-slate-900">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">
              Escalation Management
            </h1>
            <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
              Manage escalated conversations and resolve them when needed
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        
        {/* WhatsApp Instance Selection - Global for both tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cog className="h-5 w-5" />
                Choose WhatsApp Number
              </h2>
            </div>

            <Select
              value={selectedInstance}
              onValueChange={(value) => setSelectedInstance(value)}
              disabled={instances.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select WhatsApp number" />
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 ? (
                  <SelectItem value="none">
                    No connected WhatsApp numbers available
                  </SelectItem>
                ) : (
                  instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center justify-between w-full gap-x-2">
                        <span>{instance.instance_name}</span>
                        <span className="inline-flex items-center justify-center rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                          Connected
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="settings">
            <Cog className="h-5 w-5 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="conversations">
            <MessageCircle className="h-5 w-5 mr-2"/>
            Conversations
          </TabsTrigger>
        </TabsList>

        <Suspense fallback={<LoadingSpinner />}>
          <TabsContent value="conversations" className="space-y-6 mt-6">
            {activeTab === 'conversations' && (
              <ConversationsTab
                selectedInstance={selectedInstance}
                filter={filter}
                onFilterChange={setFilter}
                onViewContext={handleViewContext}
              />
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 mt-6">
            {activeTab === 'settings' && (
              <SettingsTab
                selectedInstance={selectedInstance}
                instances={instances}
              />
            )}
          </TabsContent>
        </Suspense>
      </Tabs>
      </div>

      {/* Context Dialog */}
      <ConversationDialog
        conversation={selectedConversation}
        isOpen={showContext}
        onOpenChange={setShowContext}
        getReasonBadge={getReasonBadge}
        onResolve={handleResolveEscalation}
        loading={resolveLoading}
      />
    </div>
  )
}