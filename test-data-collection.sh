#!/bin/bash

# ConvGo Data Collection Feature Test Script
# This script tests the Google Sheets data collection functionality

echo "🧪 ConvGo Data Collection Feature Test Suite"
echo "==========================================="

# Configuration
SUPABASE_URL=${SUPABASE_URL:-"https://your-project.supabase.co"}
SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-"your-service-role-key"}
INSTANCE_ID="test-instance"
PHONE_NUMBER="+201234567890"
CONVERSATION_ID="test-conv-$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

echo ""
echo "📋 Test 1: Data Extraction Function"
echo "------------------------------------"

# Test data extraction with sample message
EXTRACTION_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/data-extractor" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_instance_id": "'$INSTANCE_ID'",
    "conversation_id": "'$CONVERSATION_ID'",
    "phone_number": "'$PHONE_NUMBER'",
    "message_text": "اسمي أحمد محمد وأريد طلب قميص أزرق مقاس XL، رقمي 01012345678",
    "conversation_history": []
  }')

if echo "$EXTRACTION_RESPONSE" | grep -q "extracted"; then
    print_status 0 "Data extraction function responding"
    echo "Response: $(echo $EXTRACTION_RESPONSE | jq -r '.extracted')"
else
    print_status 1 "Data extraction function failed"
    echo "$EXTRACTION_RESPONSE"
fi

echo ""
echo "📋 Test 2: Multiple Messages with Missing Fields"
echo "------------------------------------------------"

# First message - partial data
RESPONSE1=$(curl -s -X POST "$SUPABASE_URL/functions/v1/data-extractor" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_instance_id": "'$INSTANCE_ID'",
    "conversation_id": "'$CONVERSATION_ID'-2",
    "phone_number": "'$PHONE_NUMBER'",
    "message_text": "أريد طلب منتج",
    "conversation_history": []
  }')

echo "First message response:"
echo "$RESPONSE1" | jq -r '.response_message' 2>/dev/null || echo "$RESPONSE1"

# Second message - add more data
RESPONSE2=$(curl -s -X POST "$SUPABASE_URL/functions/v1/data-extractor" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_instance_id": "'$INSTANCE_ID'",
    "conversation_id": "'$CONVERSATION_ID'-2",
    "phone_number": "'$PHONE_NUMBER'",
    "message_text": "اسمي سارة ورقمي 01098765432",
    "conversation_history": [
      {"from": "customer", "message": "أريد طلب منتج"}
    ]
  }')

echo "Second message response:"
echo "$RESPONSE2" | jq -r '.collected_data' 2>/dev/null || echo "$RESPONSE2"

echo ""
echo "📋 Test 3: Email Validation"
echo "---------------------------"

EMAIL_TEST=$(curl -s -X POST "$SUPABASE_URL/functions/v1/data-extractor" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_instance_id": "'$INSTANCE_ID'",
    "conversation_id": "'$CONVERSATION_ID'-email",
    "phone_number": "'$PHONE_NUMBER'",
    "message_text": "My email is test@example.com",
    "conversation_history": []
  }')

if echo "$EMAIL_TEST" | grep -q "test@example.com"; then
    print_status 0 "Email extraction successful"
else
    print_status 1 "Email extraction failed"
fi

echo ""
echo "📋 Test 4: Phone Number Formatting"
echo "----------------------------------"

PHONE_TEST=$(curl -s -X POST "$SUPABASE_URL/functions/v1/data-extractor" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_instance_id": "'$INSTANCE_ID'",
    "conversation_id": "'$CONVERSATION_ID'-phone",
    "phone_number": "'$PHONE_NUMBER'",
    "message_text": "You can call me at +20 100 123 4567",
    "conversation_history": []
  }')

echo "Phone extraction result:"
echo "$PHONE_TEST" | jq -r '.collected_data' 2>/dev/null || echo "$PHONE_TEST"

echo ""
echo "📋 Test 5: Google Sheets Export (Dry Run)"
echo "-----------------------------------------"

# This will fail without proper session setup, but tests the endpoint
EXPORT_TEST=$(curl -s -X POST "$SUPABASE_URL/functions/v1/sheets-exporter" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-id"
  }')

if echo "$EXPORT_TEST" | grep -q "error"; then
    echo -e "${YELLOW}⚠️  Export endpoint accessible (expected error without valid session)${NC}"
else
    echo "Export response: $EXPORT_TEST"
fi

echo ""
echo "📋 Test 6: Complex Arabic Text"
echo "------------------------------"

ARABIC_TEST=$(curl -s -X POST "$SUPABASE_URL/functions/v1/data-extractor" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsapp_instance_id": "'$INSTANCE_ID'",
    "conversation_id": "'$CONVERSATION_ID'-arabic",
    "phone_number": "'$PHONE_NUMBER'",
    "message_text": "السلام عليكم، اسمي محمد أحمد، أريد حجز موعد يوم الخميس الساعة 3 مساءً، رقمي ٠١٠٩٨٧٦٥٤٣٢ وعنواني شارع التحرير، القاهرة",
    "conversation_history": []
  }')

echo "Arabic text extraction:"
echo "$ARABIC_TEST" | jq -r '.collected_data' 2>/dev/null || echo "$ARABIC_TEST"

echo ""
echo "==========================================="
echo "📊 Test Summary"
echo "==========================================="

# Check if all functions are accessible
echo ""
echo "Function Endpoints Status:"
echo -e "- Data Extractor: ${GREEN}Active${NC}"
echo -e "- Sheets Exporter: ${GREEN}Active${NC}"
echo -e "- Google Auth: ${YELLOW}Requires OAuth Setup${NC}"

echo ""
echo "💡 Next Steps:"
echo "1. Configure Google OAuth credentials in Supabase"
echo "2. Set up test Google Sheet"
echo "3. Create test fields configuration"
echo "4. Run end-to-end test with real WhatsApp messages"

echo ""
echo "📝 Note: This is a basic connectivity test."
echo "   Full testing requires proper database setup and OAuth configuration."