import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Evolution API configuration
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') || 'https://api.convgo.com'
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') || ''

interface EscalationNotificationRequest {
  customerNumber: string
  instanceId: string
  escalationReason: string
  conversationContext?: any[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { customerNumber, instanceId, escalationReason, conversationContext } = await req.json() as EscalationNotificationRequest

    console.log('=== ESCALATION NOTIFICATION DEBUG START ===', {
      customerNumber,
      instanceId,
      escalationReason,
      conversationContextLength: conversationContext?.length || 0,
      timestamp: new Date().toISOString()
    })

    // First, get the user_id for this instance
    console.log('Step 1: Fetching instance data for instanceId:', instanceId)
    
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('user_id')
      .eq('id', instanceId)
      .single()

    console.log('Step 1 Result:', {
      instanceData: instanceData,
      instanceError: instanceError,
      instanceDataType: typeof instanceData,
      instanceDataKeys: instanceData ? Object.keys(instanceData) : 'null'
    })

    if (instanceError || !instanceData) {
      console.error('ERROR: Instance not found', { instanceError, instanceData })
      throw new Error('Instance not found')
    }

    console.log('Step 1 Success: Found user_id:', instanceData.user_id)

    // Then get support team numbers for this user
    console.log('Step 2: Fetching support team numbers for user_id:', instanceData.user_id)
    
    const { data: supportNumbers, error: supportError } = await supabase
      .from('support_team_numbers')
      .select('whatsapp_number')
      .eq('is_active', true)
      .eq('user_id', instanceData.user_id)

    console.log('Step 2 Result:', {
      supportNumbers: supportNumbers,
      supportError: supportError,
      supportNumbersType: typeof supportNumbers,
      supportNumbersIsArray: Array.isArray(supportNumbers),
      supportNumbersLength: supportNumbers?.length || 'null/undefined',
      supportNumbersKeys: supportNumbers ? Object.keys(supportNumbers) : 'null'
    })

    if (supportError) {
      console.error('ERROR: Failed to fetch support numbers', supportError)
      throw supportError
    }

    if (!supportNumbers || !Array.isArray(supportNumbers)) {
      console.error('ERROR: supportNumbers is not a valid array', {
        supportNumbers,
        type: typeof supportNumbers,
        isArray: Array.isArray(supportNumbers)
      })
      throw new Error('Support numbers data is invalid')
    }

    if (supportNumbers.length === 0) {
      console.log('WARNING: No active support team numbers found for user_id:', instanceData.user_id)
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No support team numbers configured' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Step 2 Success: Found ${supportNumbers.length} support team numbers`)

    // Create WhatsApp link for direct communication
    const customerWhatsAppLink = `https://wa.me/${customerNumber.replace(/[^0-9]/g, '')}`

    // Format the notification message
    const notificationMessage = `🚨 *Alert: New Escalated Conversation*

Customer Number: ${customerNumber}
Direct Reply: ${customerWhatsAppLink}
Escalation Reason: ${getReasonInEnglish(escalationReason)}
Time: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })}

Please handle this conversation as soon as possible.`

    // Get instance name for Evolution API
    console.log('Step 3: Fetching instance name for instanceId:', instanceId)
    
    const { data: instanceInfo, error: instanceInfoError } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('id', instanceId)
      .single()

    console.log('Step 3 Result:', {
      instanceInfo,
      instanceInfoError,
      instanceName: instanceInfo?.instance_name
    })

    if (instanceInfoError || !instanceInfo?.instance_name) {
      console.error('ERROR: Could not find instance name', { instanceInfoError, instanceInfo })
      throw new Error('Instance name not found')
    }

    const instanceName = instanceInfo.instance_name
    console.log('Step 3 Success: Found instance name:', instanceName)

    // Send notifications to all support team members using Evolution API
    console.log('Step 4: Starting to send notifications to support team members')
    console.log('Support numbers to process:', supportNumbers.map(s => ({ 
      whatsapp_number: s.whatsapp_number,
      type: typeof s.whatsapp_number 
    })))
    
    const notificationPromises = supportNumbers.map(async (support, index) => {
      console.log(`Processing support member ${index + 1}/${supportNumbers.length}:`, support.whatsapp_number)
      try {
        // Use Evolution API to send message (same as AI responses)
        const sendUrl = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`
        
        const response = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_API_KEY
          },
          body: JSON.stringify({
            number: support.whatsapp_number,
            text: notificationMessage
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Failed to send notification to ${support.whatsapp_number}:`, {
            status: response.status,
            statusText: response.statusText,
            errorText,
            sendUrl,
            requestBody: { number: support.whatsapp_number, text: notificationMessage.substring(0, 100) + '...' }
          })
          return { success: false, number: support.whatsapp_number, error: errorText }
        }

        console.log(`✅ Notification sent successfully to ${support.whatsapp_number}`)
        return { success: true, number: support.whatsapp_number }
      } catch (error) {
        console.error(`❌ Exception sending to ${support.whatsapp_number}:`, {
          error: error.message,
          stack: error.stack,
          sendUrl,
          supportNumber: support.whatsapp_number
        })
        return { success: false, number: support.whatsapp_number, error: error.message }
      }
    })

    console.log('Step 4: Waiting for all notification promises to complete...')
    const results = await Promise.all(notificationPromises)
    const successCount = results.filter(r => r.success).length
    
    console.log('Step 4 Complete: Notification results:', {
      totalAttempts: results.length,
      successCount,
      failureCount: results.length - successCount,
      results: results.map(r => ({ number: r.number, success: r.success, error: r.error || null }))
    })

    // Create escalation record with detailed logging
    console.log('Step 5: Creating escalation record in database', {
      customerNumber,
      instanceId,
      escalationReason,
      contextLength: conversationContext?.length || 0
    })

    const { data: escalation, error: escalationError } = await supabase
      .from('escalated_conversations')
      .insert({
        whatsapp_number: customerNumber,
        instance_id: instanceId,
        reason: escalationReason,
        conversation_context: conversationContext || []
      })
      .select()
      .single()

    console.log('Step 5 Result:', {
      escalation,
      escalationError,
      hasEscalation: !!escalation,
      escalationId: escalation?.id,
      escalationErrorCode: escalationError?.code,
      escalationErrorMessage: escalationError?.message,
      escalationErrorDetails: escalationError?.details
    })

    if (escalationError) {
      console.error('❌ CRITICAL ERROR: Failed to create escalation record', {
        errorCode: escalationError.code,
        errorMessage: escalationError.message,
        errorDetails: escalationError.details,
        errorHint: escalationError.hint,
        insertData: {
          whatsapp_number: customerNumber,
          instance_id: instanceId,
          reason: escalationReason,
          conversation_context_length: conversationContext?.length || 0
        }
      })
      throw escalationError
    }

    console.log('✅ Step 5 Success: Escalation record created with ID:', escalation.id)

    console.log('=== ESCALATION NOTIFICATION DEBUG END ===', {
      finalSuccess: true,
      escalationId: escalation.id,
      notificationsSent: `${successCount}/${supportNumbers.length}`,
      duration: Date.now() - new Date().getTime()
    })

    console.log('🎉 FINAL SUCCESS: All escalation steps completed', {
      escalationId: escalation.id,
      notificationsSent: `${successCount}/${supportNumbers.length}`,
      customerNotified: true,
      databaseRecordCreated: true
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notifications sent to ${successCount}/${supportNumbers.length} support team members`,
        escalationId: escalation.id,
        notificationResults: results,
        debug: {
          customerNumber,
          instanceId,
          escalationReason,
          notificationsSent: successCount,
          totalSupportMembers: supportNumbers.length,
          escalationRecordId: escalation.id
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('=== ESCALATION NOTIFICATION FATAL ERROR ===', {
      errorType: error.constructor.name,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
      originalError: error
    })
    
    // Additional debugging for the specific "object is not iterable" error
    if (error.message && error.message.includes('not iterable')) {
      console.error('DEBUGGING "not iterable" ERROR:', {
        errorLocation: 'Likely in database query or data processing',
        possibleCauses: [
          'supportNumbers is not an array',
          'instanceData is malformed', 
          'Database returned unexpected data type',
          'Supabase client error'
        ],
        troubleshootingSteps: [
          'Check supportNumbers type and value',
          'Verify database table structure',
          'Check if RLS policies are blocking data'
        ]
      })
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function getReasonInEnglish(reason: string): string {
  // Enhanced - support both keyword and AI-detected escalation
  switch (reason) {
    case 'user_request':
      return 'Customer Requested Human Support (Keyword Match)'
    case 'ai_detected_intent':
      return 'AI Detected Human Support Need (Smart Detection)'
    default:
      return 'Customer Requested Human Support'
  }
}