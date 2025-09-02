import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LanguageAwareTextarea } from '@/components/ui/language-aware-textarea'
import { LanguageAwareInput } from '@/components/ui/language-aware-input'
import { TagInput } from '@/components/ui/tag-input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { 
  Trash2, Plus, Phone, Cog, MessageCircle, AlertCircle, 
  AlertTriangle, CheckCircle, Clock, User, Calendar, Eye, 
  ExternalLink, 
  Headset
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { format, formatDistanceToNow } from 'date-fns'

// Interfaces for Settings Tab
interface SupportNumber {
  id: string
  whatsapp_number: string
  is_active: boolean
  created_at: string
}

interface InstanceSettings {
  id: string
  instance_name: string
  escalation_enabled: boolean
  escalation_message: string
  escalated_conversation_message: string
  escalation_keywords: string[]
  smart_escalation_enabled: boolean
  keyword_escalation_enabled: boolean
}

// Interfaces for Conversations Tab
interface EscalatedConversation {
  id: string
  whatsapp_number: string
  instance_id: string
  escalated_at: string
  reason: string
  conversation_context: Array<{
    from: string
    message: string
    timestamp?: string
  }>
  resolved_at: string | null
  resolved_by: string | null
  instance?: {
    instance_name: string
  }
}

interface Stats {
  total: number
  active: number
  resolved: number
  avgResolutionTime: number
}

export default function EscalationManagement() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('settings')
  const [loading, setLoading] = useState(false)
  
  // States for Settings Tab
  const [supportNumbers, setSupportNumbers] = useState<SupportNumber[]>([])
  const [newNumber, setNewNumber] = useState('')
  const [instances, setInstances] = useState<InstanceSettings[]>([])
  const [selectedInstance, setSelectedInstance] = useState<string>('')
  
  // Local editing states (not saved until Save button is clicked)
  const [localSettings, setLocalSettings] = useState<{
    escalation_message: string
    escalated_conversation_message: string
    escalation_keywords: string[]
  } | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // States for Conversations Tab
  const [conversations, setConversations] = useState<EscalatedConversation[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    resolved: 0,
    avgResolutionTime: 0
  })
  const [selectedConversation, setSelectedConversation] = useState<EscalatedConversation | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active')

  useEffect(() => {
    if (user) {
      // Load data for Settings tab
      fetchSupportNumbers()
      fetchInstances()
      
      // Load data for Conversations tab
      fetchEscalatedConversations()
    }
  }, [user])

  useEffect(() => {
    if (user && activeTab === 'conversations' && selectedInstance) {
      fetchEscalatedConversations()
    }
  }, [filter, activeTab])

  // Fetch escalated conversations when selectedInstance changes
  useEffect(() => {
    if (selectedInstance) {
      fetchEscalatedConversations()
    }
  }, [selectedInstance])

  // Update localSettings when selectedInstance changes
  useEffect(() => {
    const currentInstance = instances.find(i => i.id === selectedInstance)
    if (currentInstance) {
      setLocalSettings({
        escalation_message: currentInstance.escalation_message,
        escalated_conversation_message: currentInstance.escalated_conversation_message,
        escalation_keywords: currentInstance.escalation_keywords || []
      })
      setHasUnsavedChanges(false)
    }
  }, [selectedInstance, instances])

  // Settings Tab Functions
  const fetchSupportNumbers = async () => {
    try {
      const { data, error } = await supabase
        .from('support_team_numbers')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSupportNumbers(data || [])
    } catch (error) {
      console.error('Error fetching support numbers:', error)
      toast.error('Failed to fetch support numbers')
    }
  }

  const fetchInstances = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, escalation_enabled, escalation_message, escalated_conversation_message, escalation_keywords, smart_escalation_enabled, keyword_escalation_enabled')
        .eq('user_id', user?.id)

      if (error) throw error
      setInstances(data || [])
      if (data && data.length > 0) {
        setSelectedInstance(data[0].id)
      }
    } catch (error) {
      console.error('Error fetching instances:', error)
      toast.error('Failed to fetch WhatsApp settings')
    }
  }

  const addSupportNumber = async () => {
    if (!newNumber.trim()) {
      toast.error('Please enter WhatsApp number')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('support_team_numbers')
        .insert({
          user_id: user?.id,
          whatsapp_number: newNumber.trim()
        })

      if (error) throw error

      toast.success('Support number added successfully')
      setNewNumber('')
      fetchSupportNumbers()
    } catch (error) {
      console.error('Error adding support number:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add support number')
    } finally {
      setLoading(false)
    }
  }

  const toggleNumberStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('support_team_numbers')
        .update({ is_active: !currentStatus })
        .eq('id', id)

      if (error) throw error
      fetchSupportNumbers()
    } catch (error) {
      console.error('Error toggling number status:', error)
      toast.error('Failed to update number status')
    }
  }

  const deleteNumber = async (id: string) => {
    try {
      const { error } = await supabase
        .from('support_team_numbers')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Support number deleted')
      fetchSupportNumbers()
    } catch (error) {
      console.error('Error deleting number:', error)
      toast.error('Failed to delete number')
    }
  }

  // Save all settings at once
  const saveInstanceSettings = async () => {
    if (!selectedInstance || !localSettings) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({
          escalation_message: localSettings.escalation_message,
          escalated_conversation_message: localSettings.escalated_conversation_message,
          escalation_keywords: localSettings.escalation_keywords
        })
        .eq('id', selectedInstance)

      if (error) throw error

      toast.success('Settings saved successfully')
      setHasUnsavedChanges(false)
      fetchInstances()
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  // Update local settings without saving to database
  const updateLocalSettings = (field: keyof typeof localSettings, value: any) => {
    if (!localSettings) return
    
    setLocalSettings(prev => prev ? {
      ...prev,
      [field]: value
    } : null)
    setHasUnsavedChanges(true)
  }

  const updateInstanceSettings = async (field: string, value: any) => {
    if (!selectedInstance) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ [field]: value })
        .eq('id', selectedInstance)

      if (error) throw error

      toast.success('Settings updated successfully')
      fetchInstances()
    } catch (error) {
      console.error('Error updating settings:', error)
      toast.error('Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  // Conversations Tab Functions
  const fetchEscalatedConversations = async () => {
    if (!selectedInstance) return
    
    setLoading(true)
    try {
      let query = supabase
        .from('escalated_conversations')
        .select(`
          *,
          instance:whatsapp_instances(instance_name)
        `)
        .eq('instance_id', selectedInstance)
        .order('escalated_at', { ascending: false })

      if (filter === 'active') {
        query = query.is('resolved_at', null)
      } else if (filter === 'resolved') {
        query = query.not('resolved_at', 'is', null)
      }

      const { data, error } = await query

      if (error) throw error

      setConversations(data || [])
      calculateStats(data || [])
    } catch (error) {
      console.error('Error fetching escalated conversations:', error)
      toast.error('Failed to fetch escalated conversations')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (data: EscalatedConversation[]) => {
    const active = data.filter(c => !c.resolved_at).length
    const resolved = data.filter(c => c.resolved_at).length
    
    let totalResolutionTime = 0
    let resolvedCount = 0

    data.forEach(conv => {
      if (conv.resolved_at) {
        const escalatedTime = new Date(conv.escalated_at).getTime()
        const resolvedTime = new Date(conv.resolved_at).getTime()
        totalResolutionTime += (resolvedTime - escalatedTime) / (1000 * 60) // in minutes
        resolvedCount++
      }
    })

    setStats({
      total: data.length,
      active,
      resolved,
      avgResolutionTime: resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0
    })
  }

  const resolveEscalation = async (conversationId: string, whatsappNumber: string, instanceId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.rpc('resolve_escalation', {
        p_phone_number: whatsappNumber,
        p_instance_id: instanceId,
        p_resolved_by: user?.id
      })

      if (error) throw error

      toast.success('Escalation resolved successfully, conversation returned to AI')
      fetchEscalatedConversations()
      setShowContext(false)
      setSelectedConversation(null)
    } catch (error) {
      console.error('Error resolving escalation:', error)
      toast.error('Failed to resolve escalation')
    } finally {
      setLoading(false)
    }
  }

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'ai_detected_intent':
        return <Badge className="bg-purple-100 hover:bg-purple-200 text-purple-800">Smart AI Detection</Badge>
      case 'user_request':
        return <Badge className="bg-blue-100 hover:bg-blue-200 text-blue-800">Keyword Triggered</Badge>
      default:
        return <Badge className="bg-gray-100 hover:bg-gray-200 text-gray-800">Unknown Reason</Badge>
    }
  }

  const openWhatsApp = (phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${cleanNumber}`, '_blank')
  }

  const currentInstance = instances.find(i => i.id === selectedInstance)

  // Get active conversations count for tab badge
  const activeConversationsCount = stats.active

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
              disabled={loading || instances.length === 0}
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

        {/* Conversations Tab Content */}
        <TabsContent value="conversations" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button
                variant={filter === 'active' ? 'default' : 'outline'}
                onClick={() => setFilter('active')}
                size="sm"
              >
                Active ({stats.active})
              </Button>
              <Button
                variant={filter === 'resolved' ? 'default' : 'outline'}
                onClick={() => setFilter('resolved')}
                size="sm"
              >
                Resolved ({stats.resolved})
              </Button>
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
                size="sm"
              >
                All ({stats.total})
              </Button>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Active Conversations Card */}
            <Card className="rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30 border-red-200/50 dark:border-red-800/50 transition-colors duration-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">Active Conversations</h3>
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold text-red-700 dark:text-red-300">{stats.active}</p>
                      <p className="text-xs font-normal text-red-600/70 dark:text-red-400/70">Require Attention</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resolved Today Card */}
            <Card className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/50 dark:to-green-900/30 border-green-200/50 dark:border-green-800/50 transition-colors duration-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">Resolved Today</h3>
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold text-green-700 dark:text-green-300">{stats.resolved}</p>
                      <p className="text-xs font-normal text-green-600/70 dark:text-green-400/70">Successfully Handled</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Average Resolution Time Card */}
            <Card className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200/50 dark:border-blue-800/50 transition-colors duration-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Avg Resolution Time</h3>
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold text-blue-700 dark:text-blue-300">{stats.avgResolutionTime}<span className="text-lg font-medium ml-1">min</span></p>
                      <p className="text-xs font-normal text-blue-600/70 dark:text-blue-400/70">Response Efficiency</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Escalations Card */}
            <Card className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200/50 dark:border-purple-800/50 transition-colors duration-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-2">Total Escalations</h3>
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold text-purple-700 dark:text-purple-300">{stats.total}</p>
                      <p className="text-xs font-normal text-purple-600/70 dark:text-purple-400/70">All Time Count</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/50">
                    <MessageCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Conversations List */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Escalated Conversations List</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Manage and track conversations that have been escalated to human support
                </p>
              </div>
              <div>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-2 text-slate-600 dark:text-slate-400">Loading...</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-slate-600 dark:text-slate-400">No escalated conversations {filter !== 'all' ? `(${filter === 'active' ? 'active' : 'resolved'})` : ''}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-1 rounded-md bg-slate-100 dark:bg-slate-800">
                            <Phone className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                          </div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{conv.whatsapp_number}</span>
                          {getReasonBadge(conv.reason)}
                          {conv.resolved_at && (
                            <Badge className="bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-900 text-green-800 dark:text-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                          
                          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 ml-2">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                              <span className="font-medium">{format(new Date(conv.escalated_at), 'dd/MM/yyyy h:mm a')}</span>
                            </div>
                            {conv.instance?.instance_name && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                <span className="font-medium">{conv.instance.instance_name}</span>
                              </div>
                            )}
                          </div>

                          {conv.resolved_at && (
                            <div className="text-xs font-medium text-green-600 dark:text-green-400 ml-2">
                              Resolved: {format(new Date(conv.resolved_at), 'dd/MM/yyyy h:mm a')}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-1 ml-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedConversation(conv)
                              setShowContext(true)
                            }}
                            className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="View Context"
                          >
                            <Eye className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openWhatsApp(conv.whatsapp_number)}
                            className="h-7 w-7 p-0 hover:bg-green-50 dark:hover:bg-green-900/20"
                            title="Open WhatsApp"
                          >
                            <ExternalLink className="h-3 w-3 text-green-600 dark:text-green-400" />
                          </Button>
                          {!conv.resolved_at && (
                            <Button
                              size="sm"
                              onClick={() => resolveEscalation(conv.id, conv.whatsapp_number, conv.instance_id)}
                              disabled={loading}
                              className="h-7 px-3 text-xs"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Settings Tab Content */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          {/* Support Team Numbers Section */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="p-4">
              <div className="mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Support Team Numbers
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Add WhatsApp numbers for support team to receive notifications when conversations are escalated
                </p>
              </div>
              <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter WhatsApp number including country code (no ‘+’), e.g. 201234567890"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addSupportNumber} disabled={loading}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {supportNumbers.length === 0 ? (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                  <Phone className="h-12 w-12 mx-auto mb-2 opacity-50 text-slate-400 dark:text-slate-500" />
                  <p className="text-slate-600 dark:text-slate-400">No support numbers added</p>
                  <p className="text-sm mt-1 text-slate-500 dark:text-slate-500">Add support team numbers to receive escalation notifications</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {supportNumbers.map((number) => (
                    <div
                      key={number.id}
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        <span className="font-medium text-slate-900 dark:text-slate-100">{number.whatsapp_number}</span>
                        {!number.is_active && (
                          <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={number.is_active}
                          onCheckedChange={() => toggleNumberStatus(number.id, number.is_active)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNumber(number.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Instance Settings Section */}
          {selectedInstance && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Cog className="h-5 w-5" />
                    Escalation Settings
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Customize escalation messages and criteria for each WhatsApp account
                  </p>
                </div>
                <div className="space-y-6">

                {currentInstance && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base font-semibold">Enable Escalation System</Label>
                        <p className="text-sm text-gray-500">
                          Enable or disable automatic escalation to human support
                        </p>
                      </div>
                      <Switch
                        checked={currentInstance.escalation_enabled}
                        onCheckedChange={(checked) => updateInstanceSettings('escalation_enabled', checked)}
                      />
                    </div>

                    {/* Escalation Detection Methods */}
                    {currentInstance.escalation_enabled && (
                      <div className="space-y-4 border border-blue-300 rounded-lg p-4 bg-blue-50">
                        <div className="space-y-0.5">
                          <Label className="text-base text-blue-900 font-semibold">Choose Detection Method</Label>
                        </div>
                        
                        {/* Smart AI Detection */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="flex items-center gap-2 text-blue-900">
                              Smart AI Detection
                            </Label>
                            <p className="text-xs text-blue-600">
                              Automatically detect when customers need human support using AI intent analysis
                            </p>
                          </div>
                          <Switch
                            checked={currentInstance.smart_escalation_enabled}
                            onCheckedChange={(checked) => 
                              updateInstanceSettings('smart_escalation_enabled', checked)
                            }
                          />
                        </div>
                        
                        {/* Keyword Detection */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="flex items-center gap-2 text-blue-900">
                              Keyword Detection
                            </Label>
                            <p className="text-xs text-blue-600">
                              Trigger escalation based on specific keywords in customer messages
                            </p>
                          </div>
                          <Switch
                            checked={currentInstance.keyword_escalation_enabled}
                            onCheckedChange={(checked) => 
                              updateInstanceSettings('keyword_escalation_enabled', checked)
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* Escalation Keywords - only show if keyword escalation is enabled */}
                    {currentInstance.keyword_escalation_enabled && (
                      <div>
                        <Label>Escalation Keywords</Label>
                        <TagInput
                          value={localSettings?.escalation_keywords || currentInstance.escalation_keywords || []}
                          onChange={(keywords) => updateLocalSettings('escalation_keywords', keywords)}
                          placeholder="Type a keyword and press Enter to add"
                          className="mt-1"
                          disabled={loading}
                          maxTags={30}
                        />
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          Keywords that trigger immediate escalation to human support. Press Enter to add each keyword as a tag.
                        </p>
                      </div>
                    )}

                    <div>
                      <Label>Escalation Message</Label>
                      <LanguageAwareTextarea
                        value={localSettings?.escalation_message || currentInstance.escalation_message}
                        onChange={(e) => updateLocalSettings('escalation_message', e.target.value)}
                        className="mt-1"
                        rows={3}
                        autoExpand={false}
                        placeholder="Message sent to customer when conversation is escalated"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        This message is sent to the customer when their conversation is escalated to human support
                      </p>
                    </div>

                    <div>
                      <Label>Escalated Conversation Message</Label>
                      <LanguageAwareTextarea
                        value={localSettings?.escalated_conversation_message || currentInstance.escalated_conversation_message}
                        onChange={(e) => updateLocalSettings('escalated_conversation_message', e.target.value)}
                        className="mt-1"
                        rows={3}
                        autoExpand={false}
                        placeholder="Message sent to customer when they try to communicate during escalation"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        This message is sent to customer when they try to send messages while conversation is escalated
                      </p>
                    </div>

                    {/* Save Settings Button */}
                    <div className="flex justify-end pt-0">
                      <Button 
                        onClick={saveInstanceSettings}
                        disabled={loading || !hasUnsavedChanges}
                        className="min-w-32"
                      >
                        {loading ? 'Saving...' : 'Save Settings'}
                      </Button>
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>

      {/* Context Dialog */}
      <Dialog open={showContext} onOpenChange={setShowContext}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conversation Context</DialogTitle>
            <DialogDescription>
              Last 10 messages before escalation
            </DialogDescription>
          </DialogHeader>
          {selectedConversation && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Number:</span>{' '}
                    <span className="font-medium text-slate-900 dark:text-slate-100">{selectedConversation.whatsapp_number}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Reason:</span>{' '}
                    {getReasonBadge(selectedConversation.reason)}
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Escalated At:</span>{' '}
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {format(new Date(selectedConversation.escalated_at), 'dd/MM/yyyy h:mm a')}
                    </span>
                  </div>
                  {selectedConversation.resolved_at && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Resolved At:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {format(new Date(selectedConversation.resolved_at), 'dd/MM/yyyy h:mm a')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Conversation:</h4>
                {selectedConversation.conversation_context && selectedConversation.conversation_context.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
                    {selectedConversation.conversation_context.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg ${
                          msg.from === 'user'
                            ? 'bg-blue-100 dark:bg-blue-900 ml-auto max-w-[70%]'
                            : 'bg-slate-100 dark:bg-slate-700 mr-auto max-w-[70%]'
                        }`}
                      >
                        <p className="text-sm font-medium mb-1 text-slate-900 dark:text-slate-100">
                          {msg.from === 'user' ? 'Customer' : 'AI Assistant'}
                        </p>
                        <p className="text-sm text-slate-800 dark:text-slate-200">{msg.message}</p>
                        {msg.timestamp && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {format(new Date(msg.timestamp), 'HH:mm')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 dark:text-slate-400 text-center py-4">No conversation context available</p>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => openWhatsApp(selectedConversation.whatsapp_number)}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in WhatsApp
                </Button>
                {!selectedConversation.resolved_at && (
                  <Button
                    onClick={() => resolveEscalation(
                      selectedConversation.id,
                      selectedConversation.whatsapp_number,
                      selectedConversation.instance_id
                    )}
                    disabled={loading}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark Resolved
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}