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
    industry: string;
    communicationStyle: string;
    detectedTerms: string[];
  };
  timestamp: string;
  className?: string;
}

export function CustomerInsightCard({
  userPhone,
  lastMessage,
  emotionAnalysis,
  customerJourney,
  productInterest,
  businessContext,
  timestamp,
  className = ""
}: CustomerInsightCardProps) {
  
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSentimentColor = (score: number) => {
    if (score > 0.3) return "text-green-600";
    if (score < -0.3) return "text-red-600";
    return "text-gray-600";
  };

  const getConversionProbabilityColor = (probability: number) => {
    if (probability > 0.7) return "bg-green-500";
    if (probability > 0.4) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="text-blue-600">👤</span>
              {userPhone}
            </CardTitle>
            <CardDescription className="text-sm text-gray-500">
              {formatTimestamp(timestamp)}
            </CardDescription>
          </div>
          
          {emotionAnalysis?.urgency_detected && (
            <Badge className="bg-red-500 text-white animate-pulse">
              <span className="mr-1">🚨</span>
              عاجل
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* آخر رسالة */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-1">آخر رسالة:</p>
          <p className="text-sm text-gray-600 italic">
            "{lastMessage.length > 100 ? lastMessage.substring(0, 100) + '...' : lastMessage}"
          </p>
        </div>

        {/* تحليل المشاعر */}
        {emotionAnalysis && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">الحالة العاطفية:</p>
            <div className="flex items-center gap-2">
              <EmotionBadge 
                emotion={emotionAnalysis.primary_emotion} 
                intensity={emotionAnalysis.intensity}
              />
              <span className={`text-sm ${getSentimentColor(emotionAnalysis.sentiment_score)}`}>
                ({emotionAnalysis.sentiment_score > 0 ? '+' : ''}{Math.round(emotionAnalysis.sentiment_score * 100)}%)
              </span>
            </div>
            
            {emotionAnalysis.emotional_indicators.length > 0 && (
              <div className="text-xs text-gray-600">
                <strong>المؤشرات:</strong> {emotionAnalysis.emotional_indicators.slice(0, 3).join('، ')}
              </div>
            )}
            
            <p className="text-sm text-gray-600 italic">"{emotionAnalysis.emotional_state}"</p>
          </div>
        )}

        {/* مرحلة العميل */}
        {customerJourney && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">مرحلة العميل:</p>
            <JourneyStageBadge 
              stage={customerJourney.current_stage}
              confidence={customerJourney.stage_confidence}
              conversionProbability={customerJourney.conversion_probability}
            />
            
            {/* احتمالية التحويل */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>احتمالية التحويل</span>
                <span>{Math.round(customerJourney.conversion_probability * 100)}%</span>
              </div>
              <Progress 
                value={customerJourney.conversion_probability * 100} 
                className="h-2"
              />
            </div>
            
            {customerJourney.next_expected_action && (
              <p className="text-xs text-blue-600">
                <strong>الإجراء المتوقع:</strong> {customerJourney.next_expected_action}
              </p>
            )}
          </div>
        )}

        {/* اهتمام المنتج */}
        {productInterest && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">اهتمام المنتج:</p>
            <ProductInterestBadge 
              requestedItem={productInterest.requested_item}
              category={productInterest.category}
              urgencyLevel={productInterest.urgency_level}
              priceDiscussed={productInterest.price_range_discussed}
              specifications={productInterest.specifications}
            />
            
            {productInterest.decision_factors.length > 0 && (
              <div className="text-xs text-gray-600">
                <strong>عوامل القرار:</strong> {productInterest.decision_factors.join('، ')}
              </div>
            )}
          </div>
        )}

        {/* السياق التجاري */}
        {businessContext && (
          <div className="bg-blue-50 p-3 rounded-lg space-y-1">
            <p className="text-sm font-medium text-blue-800">السياق التجاري:</p>
            <div className="flex flex-wrap gap-1">
              <Badge className="bg-blue-100 text-blue-800 text-xs">
                {businessContext.industry}
              </Badge>
              <Badge className="bg-blue-100 text-blue-800 text-xs">
                {businessContext.communicationStyle}
              </Badge>
            </div>
            
            {businessContext.detectedTerms.length > 0 && (
              <p className="text-xs text-blue-600">
                <strong>المصطلحات:</strong> {businessContext.detectedTerms.slice(0, 4).join('، ')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}