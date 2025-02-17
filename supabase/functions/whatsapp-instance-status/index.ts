
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { instanceName } = await req.json();
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiKey) {
      throw new Error('مفتاح API غير مكوّن');
    }

    console.log(`التحقق من حالة المثيل: ${instanceName}`);

    const response = await fetch(`https://api.convgo.com/instance/info/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('استجابة API:', data);

    // If instance is not found, return a specific response
    if (response.status === 404) {
      return new Response(JSON.stringify({
        error: 'المثيل غير جاهز بعد',
        retryAfter: 2,
        details: data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 202 // Accepted but processing
      });
    }

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: 'خطأ في الحصول على حالة المثيل',
        details: data
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('خطأ في التحقق من الحالة:', error);
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
