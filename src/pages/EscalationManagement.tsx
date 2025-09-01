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
import { toast } from 'sonner'
import { 
  Trash2, Plus, Phone, Cog, MessageCircle, AlertCircle, 
  AlertTriangle, CheckCircle, Clock, User, Calendar, Eye, 
  ExternalLink 
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
    if (user && activeTab === 'conversations') {
      fetchEscalatedConversations()
    }
  }, [filter, activeTab])

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
    setLoading(true)
    try {
      let query = supabase
        .from('escalated_conversations')
        .select(`
          *,
          instance:whatsapp_instances(instance_name)
        `)
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
        return <Badge className="bg-purple-100 text-purple-800">🧠 Smart AI Detection</Badge>
      case 'user_request':
        return <Badge className="bg-blue-100 text-blue-800">🔑 Keyword Triggered</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">Unknown Reason</Badge>
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
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-6">

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="settings">
            <Cog className="h-5 w-5 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="conversations" className="relative">
            <MessageCircle className="h-5 w-5 mr-2"/>
            Conversations
            {activeConversationsCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {activeConversationsCount}
              </Badge>
            )}
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Active Conversations</p>
                    <p className="text-2xl font-bold text-red-600">{stats.active}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Resolved Today</p>
                    <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Avg Resolution Time</p>
                    <p className="text-2xl font-bold">{stats.avgResolutionTime} min</p>
                  </div>
                  <Clock className="h-8 w-8 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Escalations</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <MessageCircle className="h-8 w-8 text-purple-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Conversations List */}
          <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle>Escalated Conversations List</CardTitle>
              <CardDescription>
                Manage and track conversations that have been escalated to human support
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                      className={`border border-slate-200 dark:border-slate-700 rounded-lg p-4 ${conv.resolved_at ? 'bg-slate-50 dark:bg-slate-800' : 'bg-yellow-50 dark:bg-yellow-900/20'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Phone className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            <span className="font-medium text-slate-900 dark:text-slate-100">{conv.whatsapp_number}</span>
                            {getReasonBadge(conv.reason)}
                            {conv.resolved_at && (
                              <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Resolved
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                              {format(new Date(conv.escalated_at), 'dd/MM/yyyy HH:mm')}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                              {formatDistanceToNow(new Date(conv.escalated_at), { addSuffix: true })}
                            </div>
                            {conv.instance?.instance_name && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                                {conv.instance.instance_name}
                              </div>
                            )}
                          </div>

                          {conv.resolved_at && (
                            <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                              Resolved at: {format(new Date(conv.resolved_at), 'dd/MM/yyyy HH:mm')}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedConversation(conv)
                              setShowContext(true)
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Context
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openWhatsApp(conv.whatsapp_number)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open WhatsApp
                          </Button>
                          {!conv.resolved_at && (
                            <Button
                              size="sm"
                              onClick={() => resolveEscalation(conv.id, conv.whatsapp_number, conv.instance_id)}
                              disabled={loading}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Mark Resolved
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab Content */}
        <TabsContent value="settings" className="space-y-6 mt-6">
          {/* Support Team Numbers Section */}
          <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Human Support Team Numbers
              </CardTitle>
              <CardDescription>
                Add WhatsApp numbers for support team to receive notifications when conversations are escalated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Instance Settings Section */}
          {instances.length > 0 && (
            <Card className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cog className="h-5 w-5" />
                  Escalation Settings
                </CardTitle>
                <CardDescription>
                  Customize escalation messages and criteria for each WhatsApp account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {instances.length > 1 && (
                  <div>
                    <Label>Select WhatsApp Account</Label>
                    <select
                      className="w-full mt-1 p-2 border rounded-md"
                      value={selectedInstance}
                      onChange={(e) => setSelectedInstance(e.target.value)}
                    >
                      {instances.map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          {instance.instance_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
                          <Label className="text-base text-blue-900 font-medium">Escalation Detection Methods</Label>
                          <p className="text-sm text-blue-600">
                            Configure how escalations are detected
                          </p>
                        </div>
                        
                        {/* Smart AI Detection */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label className="flex items-center gap-2 text-blue-900">
                              Smart AI Detection
                            </Label>
                            <p className="text-sm text-blue-600">
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
                            <p className="text-sm text-blue-600">
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
              </CardContent>
            </Card>
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
                      {format(new Date(selectedConversation.escalated_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  {selectedConversation.resolved_at && (
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Resolved At:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {format(new Date(selectedConversation.resolved_at), 'dd/MM/yyyy HH:mm')}
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