# 🧪 **External Actions - خطة الاختبار الشاملة**

## 📋 **نظرة عامة على النظام**

External Actions هو نظام متكامل لتنفيذ إجراءات خارجية بناءً على رسائل العملاء في WhatsApp، مع دعم ردود مرنة وقابلة للتخصيص (V2).

### **المكونات الأساسية:**
- **Frontend:** React Components للإدارة والاختبار
- **Backend:** Supabase Edge Functions لتنفيذ العمليات
- **Database:** جداول لحفظ الإعدادات والسجلات
- **Integration:** تكامل مع WhatsApp وأنظمة خارجية

---

## 🎯 **أهداف الاختبار**

1. ✅ **التأكد من صحة إنشاء وتعديل External Actions**
2. ✅ **اختبار دقة كشف النوايا (Intent Detection)**
3. ✅ **التحقق من تنفيذ Webhooks بشكل صحيح**
4. ✅ **اختبار جميع أنواع الردود (V1 & V2)**
5. ✅ **ضمان الأمان وحماية البيانات**
6. ✅ **اختبار الأداء تحت الأحمال العالية**
7. ✅ **التأكد من التوافق مع منصات الأتمتة المختلفة**

---

## 🏗️ **بنية نظام الاختبار**

### **1. Frontend Testing**
```
├── Pages Testing
│   ├── ExternalActions.tsx
│   ├── CreateExternalAction.tsx
│   └── EditExternalAction.tsx
├── Components Testing
│   ├── ExternalActionBuilder.tsx
│   ├── ExternalActionForm.tsx
│   ├── ExternalActionTester.tsx
│   └── ExternalActionLogs.tsx
└── UI/UX Testing
    ├── Responsive Design
    ├── Accessibility
    └── User Experience Flow
```

### **2. Backend Testing**
```
├── Edge Functions
│   ├── external-action-executor
│   ├── external-action-response-handler
│   └── smart-intent-analyzer
├── Database Operations
│   ├── CRUD Operations
│   ├── Data Integrity
│   └── Performance Queries
└── API Endpoints
    ├── Authentication
    ├── Rate Limiting
    └── Error Handling
```

### **3. Integration Testing**
```
├── WhatsApp Integration
│   ├── Message Reception
│   ├── Message Sending
│   └── Instance Management
├── Webhook Integration
│   ├── Outgoing Webhooks
│   ├── Incoming Responses
│   └── Timeout Handling
└── External Platforms
    ├── Make.com
    ├── Zapier
    └── n8n
```

---

## 📊 **قاعدة البيانات - نموذج الاختبار**

### **Tables Schema:**
```sql
-- External Actions V2 Tables
external_actions (
  id, user_id, whatsapp_instance_id, action_name, display_name,
  training_examples, webhook_url, http_method, headers, payload_template,
  variable_prompts, confidence_threshold, is_active, retry_attempts,
  timeout_seconds,
  -- V2 Fields:
  response_type, confirmation_message, wait_for_response,
  response_timeout_seconds, response_language,
  created_at, updated_at
)

external_action_logs (
  id, external_action_id, whatsapp_conversation_id, whatsapp_message_id,
  intent_confidence, extracted_variables, webhook_payload, webhook_response,
  http_status_code, execution_status, error_message, execution_time_ms,
  retry_count, executed_at
)

external_action_responses (
  id, execution_log_id, conversation_id, user_phone, instance_name,
  response_received, response_message, response_data, received_at,
  created_at, expires_at
)
```

---

## 🧪 **خطة الاختبار التفصيلية**

## **Phase 1: Unit Testing (اختبار الوحدات)**

### **1.1 Frontend Components Testing**

#### **ExternalActionBuilder Component**
```typescript
// Test Cases:
describe('ExternalActionBuilder', () => {
  test('should render all 6 steps correctly', () => {
    // Verify: Basic Info, Training, Webhook, Payload, Settings, Response
  });

  test('should validate required fields', () => {
    // Test: display_name, action_name, webhook_url validation
  });

  test('should handle step navigation', () => {
    // Test: Next/Previous buttons, step completion
  });

  test('should save action configuration', () => {
    // Test: Create new action, Update existing action
  });
});
```

#### **ExternalActionTester Component**
```typescript
describe('ExternalActionTester', () => {
  test('should test message detection', () => {
    // Test: Intent detection with various messages
  });

  test('should execute webhook test', () => {
    // Test: Webhook execution simulation
  });

  test('should display results correctly', () => {
    // Test: Detection, Payload, Response, Execution tabs
  });
});
```

### **1.2 Edge Functions Testing**

#### **external-action-executor Function**
```typescript
describe('external-action-executor', () => {
  test('should execute webhook with correct payload', () => {
    // Test: Payload interpolation, HTTP request execution
  });

  test('should handle retry logic', () => {
    // Test: Failed requests, exponential backoff
  });

  test('should log execution results', () => {
    // Test: Database logging, error handling
  });
});
```

---

## **Phase 2: Integration Testing (اختبار التكامل)**

### **2.1 Full Flow Testing**

#### **Scenario 1: Simple Confirmation Action**
```yaml
Test Case: "Simple Order Confirmation"
Setup:
  - Action Type: simple_confirmation
  - Training Example: "أريد طلب بيتزا"
  - Webhook URL: https://webhook.site/test
  - Response Message: "تم استلام طلبك بنجاح"

Steps:
  1. Send WhatsApp message: "أريد طلب بيتزا مارغريتا"
  2. Verify intent detection (confidence > threshold)
  3. Verify webhook execution
  4. Verify simple confirmation sent to user

Expected Results:
  - Intent detected with high confidence
  - Webhook called with correct payload
  - User receives confirmation message
  - Execution logged in database
```

#### **Scenario 2: Custom Message with Variables**
```yaml
Test Case: "Restaurant Order with Variables"
Setup:
  - Action Type: custom_message
  - Variables: {item_name, quantity, total_price}
  - Response Template: "طلبك: {quantity} {item_name} بمبلغ {total_price} جنيه"

Steps:
  1. Send message: "أريد 2 برجر دجاج"
  2. Verify variable extraction
  3. Verify webhook execution
  4. Verify personalized response

Expected Results:
  - Variables extracted correctly
  - Response message personalized
  - All data logged properly
```

#### **Scenario 3: Wait for Webhook Response**
```yaml
Test Case: "Appointment Booking with Dynamic Response"
Setup:
  - Action Type: wait_for_webhook
  - Timeout: 30 seconds
  - Variables: {preferred_date, specialty}

Steps:
  1. Send message: "أريد حجز موعد مع دكتور قلب غداً"
  2. Verify webhook execution with response URL
  3. Simulate external system response
  4. Verify dynamic response sent to user

Expected Results:
  - Webhook includes _response_url and _execution_id
  - External system can send response
  - User receives dynamic message
  - Response logged in external_action_responses table
```

### **2.2 Error Handling Testing**

#### **Webhook Failures**
```yaml
Test Cases:
  1. Webhook URL unreachable (network error)
  2. Webhook returns 4xx error (client error)
  3. Webhook returns 5xx error (server error)
  4. Webhook timeout (slow response)
  5. Invalid webhook response format

Expected Behavior:
  - Retry mechanism activated
  - Errors logged with details
  - User notified appropriately
  - System remains stable
```

#### **Response Timeout Testing**
```yaml
Test Case: "Wait for Webhook Timeout"
Setup:
  - Response timeout: 10 seconds
  - No response from external system

Steps:
  1. Execute action with wait_for_webhook
  2. Wait for timeout period
  3. Verify timeout handling

Expected Results:
  - Timeout message sent to user
  - Response record marked as expired
  - System continues normal operation
```

---

## **Phase 3: End-to-End Testing (اختبار شامل)**

### **3.1 Complete User Journey Testing**

#### **Journey 1: Create Action → Test → Deploy → Use**
```yaml
Scenario: "Restaurant Owner Creates Food Ordering System"

Step 1: Action Creation
  - Login to ConvGo platform
  - Navigate to External Actions
  - Create new action: "Food Order"
  - Configure training examples
  - Set up webhook integration
  - Configure custom response message

Step 2: Testing
  - Use built-in tester
  - Test various message formats
  - Verify webhook execution
  - Validate response formatting

Step 3: Deployment
  - Activate the action
  - Monitor logs for issues

Step 4: Real Usage
  - Customer sends order via WhatsApp
  - System processes and responds
  - Restaurant receives order data
  - Customer gets confirmation

Validation Points:
  ✅ Action created successfully
  ✅ Testing shows expected results
  ✅ Real messages trigger correctly
  ✅ Integration works with restaurant system
  ✅ Customers receive proper confirmations
```

### **3.2 Multi-Action Testing**
```yaml
Scenario: "Multiple Actions for Same WhatsApp Instance"

Setup:
  - Action 1: "Order Food" (custom_message)
  - Action 2: "Book Table" (wait_for_webhook)
  - Action 3: "Check Hours" (simple_confirmation)

Test Cases:
  1. Send messages that should trigger Action 1
  2. Send messages that should trigger Action 2
  3. Send messages that should trigger Action 3
  4. Send ambiguous messages
  5. Send messages that shouldn't trigger any action

Expected Results:
  - Correct action triggered for each message type
  - No false positives
  - Ambiguous cases handled gracefully
```

---

## **Phase 4: Performance Testing (اختبار الأداء)**

### **4.1 Load Testing**

#### **High Volume Message Processing**
```yaml
Test Scenario: "1000 Concurrent Messages"
Setup:
  - 1000 simulated WhatsApp messages
  - Mixed action types
  - Send within 1 minute window

Metrics to Monitor:
  - Response time per message
  - Database query performance
  - Memory usage
  - CPU utilization
  - Success/failure rates

Acceptance Criteria:
  - 95% of messages processed within 5 seconds
  - No memory leaks
  - Database remains responsive
  - Error rate < 1%
```

#### **Webhook Performance**
```yaml
Test Scenario: "Webhook Execution Under Load"
Metrics:
  - Webhook response times
  - Retry mechanism performance
  - Database logging speed
  - Concurrent execution handling

Benchmarks:
  - Average webhook execution: < 2 seconds
  - Retry logic: 3 attempts with exponential backoff
  - Database logging: < 100ms per record
  - Concurrent executions: Up to 50 parallel
```

### **4.2 Stress Testing**
```yaml
Extreme Scenarios:
  1. 10,000 actions per WhatsApp instance
  2. Very long training examples (1000+ characters)
  3. Complex payload templates with 50+ variables
  4. Webhook responses with large JSON (1MB+)
  5. Extended timeout periods (120 seconds)
```

---

## **Phase 5: Security Testing (اختبار الأمان)**

### **5.1 Authentication & Authorization**
```yaml
Test Cases:
  1. Unauthorized access to External Actions page
  2. Cross-user action access attempts
  3. Invalid JWT token handling
  4. Session timeout behavior
  5. API key validation for webhooks

Expected Security Measures:
  ✅ Row Level Security (RLS) enforced
  ✅ User can only access their own actions
  ✅ API endpoints require valid authentication
  ✅ Sensitive data encrypted in database
```

### **5.2 Input Validation & Sanitization**
```yaml
Attack Vectors to Test:
  1. SQL Injection in action names
  2. XSS in training examples
  3. JSON payload manipulation
  4. Webhook URL hijacking
  5. Large payload attacks (DoS)

Validation Tests:
  - Special characters in all input fields
  - Oversized JSON payloads
  - Invalid webhook URLs
  - Malicious script injections
  - SQL injection attempts
```

### **5.3 Data Protection**
```yaml
Privacy Tests:
  1. User phone numbers encryption
  2. Message content security
  3. Webhook payload sanitization
  4. Log data retention policies
  5. GDPR compliance for user data

Validation:
  - No sensitive data in plain text logs
  - User data anonymized where possible
  - Audit trail for data access
  - Secure transmission (HTTPS only)
```

---

## **Phase 6: Compatibility Testing (اختبار التوافق)**

### **6.1 External Platform Integration**

#### **Make.com Integration**
```yaml
Test Scenarios:
  1. Create Make scenario to receive webhooks
  2. Process data and send response back
  3. Handle different response formats
  4. Error handling in Make scenarios
  5. Timeout behavior

Sample Make.com Webhook Response:
```json
{
  "execution_log_id": "exec_123456",
  "response_message": "تم حجز موعدك للغد الساعة 3 مساءً",
  "response_data": {
    "appointment_id": "APT789",
    "doctor": "د. أحمد محمد",
    "date": "2025-01-21",
    "time": "15:00"
  }
}
```

#### **Zapier Integration**
```yaml
Test Scenarios:
  1. Zapier webhook trigger setup
  2. Multi-step zap with ConvGo response
  3. Error handling and retries
  4. Different response data formats

Sample Zapier Response Format:
```python
# Zapier Code Step
response_data = {
    'execution_log_id': input_data['_execution_id'],
    'response_message': f"طلبك رقم {order_id} تم تسجيله",
    'status': 'success'
}
```

#### **n8n Integration**
```yaml
Test Scenarios:
  1. n8n workflow with webhook node
  2. Data transformation and response
  3. Conditional response logic
  4. Error workflow handling
```

### **6.2 WhatsApp Instance Compatibility**
```yaml
Test Cases:
  1. Different WhatsApp instance types
  2. Various message formats (text, media)
  3. Group vs individual messages
  4. Different languages and encodings
  5. Emoji and special character handling
```

---

## **Phase 7: Accessibility & Usability Testing**

### **7.1 UI/UX Testing**
```yaml
Accessibility Checks:
  ✅ Screen reader compatibility
  ✅ Keyboard navigation support
  ✅ Color contrast ratios
  ✅ Mobile responsiveness
  ✅ Touch targets size (mobile)

Usability Tests:
  1. New user onboarding flow
  2. Action creation complexity
  3. Error message clarity
  4. Help documentation availability
  5. Multi-language interface support
```

### **7.2 Mobile Testing**
```yaml
Device Testing:
  - iOS Safari (iPhone 12, 13, 14)
  - Android Chrome (Samsung, Pixel)
  - Tablet view (iPad, Android tablets)
  - Different screen sizes and orientations

Functionality Tests:
  - Touch interactions
  - Form input on mobile keyboards
  - Responsive layout behavior
  - Performance on slower devices
```

---

## **Phase 8: Regression Testing (اختبار التراجع)**

### **8.1 V1 to V2 Migration Testing**
```yaml
Backward Compatibility Tests:
  1. Existing V1 actions continue to work
  2. Default response_type applied correctly
  3. No breaking changes in API
  4. Database migration successful
  5. Frontend handles both versions

Test Cases:
  - Load existing V1 actions
  - Execute them without modifications
  - Verify they work as before
  - Upgrade to V2 features
  - Verify enhanced functionality
```

### **8.2 Feature Integration Testing**
```yaml
Cross-Feature Tests:
  1. External Actions + AI Assistant interaction
  2. External Actions + Customer Profiles
  3. External Actions + Data Collection
  4. External Actions + Usage Insights
  5. External Actions + Smart Escalation

Integration Points:
  - Shared database tables
  - Common authentication
  - Unified message processing
  - Cross-component navigation
```

---

## 📋 **Test Data Management**

### **Sample Test Data Sets**

#### **Test Actions Configuration**
```json
{
  "test_actions": [
    {
      "name": "simple_food_order",
      "type": "simple_confirmation",
      "training_examples": [
        "أريد طلب بيتزا",
        "عايز أطلب أكل",
        "ممكن منيو"
      ],
      "webhook_url": "https://webhook.site/test-simple",
      "confirmation_message": "تم استلام طلبك"
    },
    {
      "name": "appointment_booking",
      "type": "wait_for_webhook",
      "training_examples": [
        "أريد حجز موعد",
        "متى الكشف متاح",
        "أحجز مع الدكتور"
      ],
      "webhook_url": "https://webhook.site/test-booking",
      "response_timeout_seconds": 30
    },
    {
      "name": "order_with_details",
      "type": "custom_message",
      "training_examples": [
        "أطلب {quantity} {item}",
        "عايز أشتري {product}",
        "ممكن {number} من {item_name}"
      ],
      "webhook_url": "https://webhook.site/test-custom",
      "confirmation_message": "طلبك: {quantity} {item} تم تسجيله"
    }
  ]
}
```

#### **Test Messages Dataset**
```json
{
  "positive_tests": [
    "أريد طلب بيتزا مارغريتا",
    "عايز أطلب 2 برجر دجاج",
    "ممكن أحجز موعد مع دكتور قلب",
    "أشتري 3 كتب إنجليزي",
    "محتاج موعد كشف غداً"
  ],
  "negative_tests": [
    "مرحباً كيف الحال",
    "شكراً لك",
    "معلش مش عارف",
    "أيه الأخبار النهاردة",
    "تصبح على خير"
  ],
  "edge_cases": [
    "أريد أطلب",
    "موعد",
    "123",
    "🍕🍔🎂",
    "abcdef12345"
  ]
}
```

### **Mock External Services**
```yaml
Mock Services Setup:
  1. Webhook.site for webhook testing
  2. Postman Mock Server for API simulation
  3. Local Mock Make.com scenarios
  4. Test WhatsApp instances
  5. Dummy payment gateways for e-commerce tests
```

---

## 📊 **Test Metrics & KPIs**

### **Performance Metrics**
```yaml
Response Time Targets:
  - Intent Detection: < 2 seconds
  - Webhook Execution: < 5 seconds
  - Database Queries: < 200ms
  - UI Loading: < 3 seconds
  - End-to-end Flow: < 10 seconds

Success Rate Targets:
  - Intent Detection Accuracy: > 90%
  - Webhook Success Rate: > 95%
  - Message Delivery: > 98%
  - System Uptime: > 99.5%
```

### **Quality Metrics**
```yaml
Code Coverage Targets:
  - Frontend Components: > 80%
  - Edge Functions: > 90%
  - Database Queries: > 85%
  - Integration Tests: > 75%

Bug Metrics:
  - Critical Bugs: 0
  - Major Bugs: < 2
  - Minor Bugs: < 10
  - Bug Resolution Time: < 24 hours
```

---

## 🛠️ **Testing Tools & Environment**

### **Frontend Testing Stack**
```yaml
Tools:
  - Jest + React Testing Library
  - Cypress for E2E testing
  - Storybook for component testing
  - Axe for accessibility testing
  - Chrome DevTools for performance

Environment:
  - Node.js 18+
  - React 18
  - TypeScript 4.9+
  - Vite build tool
```

### **Backend Testing Stack**
```yaml
Tools:
  - Deno test runner for Edge Functions
  - Supabase local development
  - Postman/Newman for API testing
  - Artillery.js for load testing
  - Docker for environment consistency

Environment:
  - Deno runtime
  - Supabase CLI
  - PostgreSQL database
  - Redis for caching (if applicable)
```

### **Integration Testing Tools**
```yaml
Tools:
  - Playwright for browser automation
  - WebDriver for cross-browser testing
  - Mock Service Worker (MSW)
  - Ngrok for webhook testing
  - k6 for performance testing

Services:
  - GitHub Actions for CI/CD
  - Vercel for preview deployments
  - Sentry for error monitoring
  - DataDog for performance monitoring
```

---

## 📅 **Testing Schedule & Phases**

### **Testing Timeline (Recommended)**
```yaml
Week 1: Setup & Unit Testing
  - Environment setup
  - Mock services configuration
  - Unit tests implementation
  - Code coverage analysis

Week 2: Integration Testing
  - Component integration tests
  - Database integration tests
  - Webhook integration tests
  - Error handling validation

Week 3: End-to-End Testing
  - Complete user journeys
  - Cross-browser testing
  - Mobile responsiveness
  - Accessibility compliance

Week 4: Performance & Security
  - Load testing
  - Stress testing
  - Security vulnerability scans
  - Penetration testing

Week 5: UAT & Bug Fixes
  - User acceptance testing
  - Bug fixes and retesting
  - Final validation
  - Documentation updates
```

### **Test Execution Priority**
```yaml
Priority 1 (Critical):
  - Core functionality tests
  - Data integrity tests
  - Security tests
  - Performance baseline tests

Priority 2 (Important):
  - Edge case handling
  - Error recovery tests
  - Integration tests
  - Usability tests

Priority 3 (Nice to have):
  - Advanced feature tests
  - Optimization tests
  - Experimental scenarios
  - Future compatibility tests
```

---

## ✅ **Test Completion Criteria**

### **Definition of Done**
```yaml
Functional Tests:
  ✅ All critical user journeys pass
  ✅ All API endpoints tested and working
  ✅ Database operations validated
  ✅ Error handling verified
  ✅ Integration points tested

Non-Functional Tests:
  ✅ Performance targets met
  ✅ Security vulnerabilities addressed
  ✅ Accessibility standards met
  ✅ Mobile compatibility confirmed
  ✅ Browser compatibility verified

Documentation:
  ✅ Test results documented
  ✅ Known issues logged
  ✅ User guides updated
  ✅ API documentation current
  ✅ Troubleshooting guide ready
```

### **Sign-off Requirements**
```yaml
Stakeholder Approvals:
  ✅ Product Owner sign-off
  ✅ Technical Lead approval
  ✅ QA Team validation
  ✅ Security Team clearance
  ✅ DevOps deployment approval

Metrics Achievement:
  ✅ Performance benchmarks met
  ✅ Quality gates passed
  ✅ Coverage thresholds reached
  ✅ Bug counts within limits
  ✅ User acceptance criteria satisfied
```

---

## 🚨 **Risk Management & Contingency**

### **High-Risk Areas**
```yaml
Technical Risks:
  1. WhatsApp API rate limiting
  2. Database performance under load
  3. Webhook timeout handling
  4. Memory leaks in long-running processes
  5. Cross-browser compatibility issues

Mitigation Strategies:
  - Comprehensive load testing
  - Fallback mechanisms
  - Monitoring and alerting
  - Performance optimization
  - Progressive enhancement approach
```

### **Rollback Plan**
```yaml
Rollback Triggers:
  - Critical security vulnerability
  - Data loss or corruption
  - Performance degradation > 50%
  - Success rate drop < 90%
  - Major functionality broken

Rollback Process:
  1. Immediate system health assessment
  2. Database backup restoration (if needed)
  3. Previous version deployment
  4. User notification (if required)
  5. Post-incident analysis
```

---

## 📚 **Documentation & Reporting**

### **Test Report Template**
```yaml
Executive Summary:
  - Overall test results
  - Critical issues found
  - Performance metrics
  - Recommendations

Detailed Results:
  - Test case execution summary
  - Pass/fail statistics
  - Performance benchmarks
  - Security assessment results

Issue Tracking:
  - Critical issues list
  - Bug severity analysis
  - Resolution timeline
  - Outstanding items

Recommendations:
  - Production readiness assessment
  - Optimization suggestions
  - Future testing considerations
  - Maintenance guidelines
```

### **Continuous Testing Strategy**
```yaml
Ongoing Testing:
  - Daily smoke tests
  - Weekly regression tests
  - Monthly performance reviews
  - Quarterly security assessments

Monitoring & Alerts:
  - Real-time error tracking
  - Performance monitoring
  - User experience metrics
  - Business KPI tracking
```

---

## 🎯 **Success Criteria Summary**

### **Technical Success Metrics**
- ✅ **99.9% System Uptime** during testing period
- ✅ **< 2 seconds** average response time
- ✅ **95%+ Success Rate** for all operations
- ✅ **Zero Critical Security Issues**
- ✅ **90%+ Code Coverage** across all modules

### **Business Success Metrics**
- ✅ **User-friendly Interface** (SUS Score > 80)
- ✅ **Complete Feature Set** as per requirements
- ✅ **Scalable Architecture** (handles 10x current load)
- ✅ **Integration Ready** with popular platforms
- ✅ **Production Deployment Ready**

---

## 🔄 **Continuous Improvement**

### **Post-Launch Monitoring**
```yaml
Key Metrics to Track:
  - User adoption rates
  - Feature usage patterns
  - Error rates and types
  - Performance trends
  - Customer satisfaction scores

Feedback Loops:
  - User feedback collection
  - Support ticket analysis
  - Performance monitoring
  - Security audits
  - Regular code reviews
```

### **Future Enhancements**
```yaml
Potential Improvements:
  1. AI-powered testing automation
  2. Advanced analytics dashboard
  3. Multi-language testing support
  4. Cloud-native testing infrastructure
  5. Real-time collaboration features

Innovation Areas:
  - Machine learning for test optimization
  - Automated test case generation
  - Predictive failure analysis
  - Self-healing test suites
  - Continuous user experience monitoring
```

---

## 📞 **Support & Contact Information**

### **Testing Team Contacts**
- **QA Lead:** [Name] - [email] - [phone]
- **Technical Lead:** [Name] - [email] - [phone]
- **Product Owner:** [Name] - [email] - [phone]
- **DevOps Engineer:** [Name] - [email] - [phone]

### **Emergency Escalation**
- **Critical Issues:** [24/7 contact]
- **Security Incidents:** [Security team contact]
- **Production Issues:** [On-call engineer]

---

**Document Version:** 1.0
**Last Updated:** كانون الثاني 2025
**Next Review:** شباط 2025
**Status:** ✅ Ready for Implementation

---

*هذه الخطة الشاملة تغطي جميع جوانب اختبار نظام External Actions وتضمن جودة عالية وموثوقية كاملة للنظام.*