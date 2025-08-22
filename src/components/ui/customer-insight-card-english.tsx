import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmotionBadge } from "./emotion-badge";
import { JourneyStageBadge } from "./journey-stage-badge";
import { ProductInterestBadge } from "./product-interest-badge";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface CustomerInsightCardProps {
  userPhone: string;
  lastMessage: string;
  emotionAnalysis?: {
    primary_emotion: string;
    intensity: number;
    emotional_indicators: string[];
    sentiment_score: number;
    emotional_state: string;
    urgency_detected: boolean;
  };
  customerJourney?: {
    current_stage: string;
    stage_confidence: number;
    progression_indicators: string[];
    next_expected_action: string;
    conversion_probability: number;
  };
  productInterest?: {
    requested_item: string | null;
    category: string | null;
    specifications: string[];
    price_range_discussed: boolean;
    urgency_level: string;
    decision_factors: string[];
  };
  businessContext?: {
    industryCategory: string;
    companySize: string;
    decisionMakerLevel: string;
    budgetIndicators: string[];
    detectedTerms: string[];
  };
}

export function CustomerInsightCard({
  userPhone,
  lastMessage,
  emotionAnalysis,
  customerJourney,
  productInterest,
  businessContext
}: CustomerInsightCardProps) {
  
  // Get conversation urgency level
  const getUrgencyLevel = () => {
    if (emotionAnalysis?.urgency_detected) return "high";
    if (emotionAnalysis?.primary_emotion === "frustrated" || emotionAnalysis?.primary_emotion === "angry") return "medium";
    return "low";
  };

  const urgencyLevel = getUrgencyLevel();
  const urgencyColors = {
    high: "bg-red-500",
    medium: "bg-yellow-500",
    low: "bg-green-500"
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg font-semibold">+{userPhone}</span>
          <div className="flex items-center gap-2">
            {urgencyLevel && (
              <Badge className={`${urgencyColors[urgencyLevel as keyof typeof urgencyColors]} text-white text-xs`}>
                {urgencyLevel.toUpperCase()} PRIORITY
              </Badge>
            )}
          </div>
        </CardTitle>
        
        <div className="flex flex-wrap gap-2 mt-2">
          {emotionAnalysis && (
            <EmotionBadge 
              emotion={emotionAnalysis.primary_emotion} 
              intensity={emotionAnalysis.intensity}
            />
          )}
          
          {customerJourney && (
            <JourneyStageBadge 
              stage={customerJourney.current_stage}
              confidence={customerJourney.stage_confidence}
              conversionProbability={customerJourney.conversion_probability}
            />
          )}
          
          {emotionAnalysis?.urgency_detected && (
            <Badge className="bg-red-500 text-white animate-pulse">
              <span className="mr-1">🚨</span>
              Urgent
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Last message */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-1">Last message:</p>
          <p className="text-sm text-gray-600 italic">
            "{lastMessage.length > 150 ? lastMessage.substring(0, 150) + '...' : lastMessage}"
          </p>
        </div>

        {/* Emotion analysis */}
        {emotionAnalysis && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Emotional state:</p>
            <div className="flex flex-wrap gap-2">
              <EmotionBadge 
                emotion={emotionAnalysis.primary_emotion} 
                intensity={emotionAnalysis.intensity}
                className="mb-1"
              />
              
              <Badge className={`text-xs ${emotionAnalysis.sentiment_score > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                Sentiment: {emotionAnalysis.sentiment_score > 0 ? 'Positive' : 'Negative'} ({Math.abs(emotionAnalysis.sentiment_score * 100).toFixed(0)}%)
              </Badge>
            </div>
            
            {emotionAnalysis.emotional_indicators.length > 0 && (
              <p className="text-xs text-gray-500">
                <strong>Indicators:</strong> {emotionAnalysis.emotional_indicators.slice(0, 3).join(', ')}
                {emotionAnalysis.emotional_indicators.length > 3 && '...'}
              </p>
            )}
          </div>
        )}

        {/* Customer journey */}
        {customerJourney && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Customer journey:</p>
            <div className="space-y-2">
              <JourneyStageBadge 
                stage={customerJourney.current_stage}
                confidence={customerJourney.stage_confidence}
                conversionProbability={customerJourney.conversion_probability}
              />
              
              {/* Conversion probability */}
              {customerJourney.conversion_probability && (
                <div className="flex items-center gap-2">
                  <span>Conversion probability</span>
                  <Progress 
                    value={customerJourney.conversion_probability * 100} 
                    className="flex-1 h-2"
                  />
                  <span className="text-sm font-medium">
                    {Math.round(customerJourney.conversion_probability * 100)}%
                  </span>
                </div>
              )}
              
              {customerJourney.next_expected_action && (
                <p className="text-xs text-blue-600">
                  <strong>Expected action:</strong> {customerJourney.next_expected_action}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Product interest */}
        {productInterest && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Product interest:</p>
            <ProductInterestBadge
              requestedItem={productInterest.requested_item}
              category={productInterest.category}
              urgencyLevel={productInterest.urgency_level}
              priceDiscussed={productInterest.price_range_discussed}
              specifications={productInterest.specifications}
            />
            
            {productInterest.decision_factors.length > 0 && (
              <p className="text-xs text-gray-500">
                <strong>Decision factors:</strong> {productInterest.decision_factors.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Business context */}
        {businessContext && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-blue-800">Business context:</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div><strong>Industry:</strong> {businessContext.industryCategory}</div>
              <div><strong>Company Size:</strong> {businessContext.companySize}</div>
              <div><strong>Decision Level:</strong> {businessContext.decisionMakerLevel}</div>
              <div><strong>Budget Signals:</strong> {businessContext.budgetIndicators.length}</div>
            </div>
            
            {businessContext.detectedTerms.length > 0 && (
              <p className="text-xs text-gray-600 mt-2">
                <strong>Terms:</strong> {businessContext.detectedTerms.slice(0, 4).join(', ')}
                {businessContext.detectedTerms.length > 4 && '...'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}