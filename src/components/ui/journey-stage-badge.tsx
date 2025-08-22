import { Badge } from "@/components/ui/badge";

// Colors and icons for different customer journey stages
const stageConfig = {
  awareness: { 
    color: "bg-blue-400", 
    emoji: "🔍", 
    label: "Awareness",
    description: "Discovering the problem or need"
  },
  consideration: { 
    color: "bg-yellow-500", 
    emoji: "🤔", 
    label: "Consideration",
    description: "Researching and comparing solutions"
  },
  decision: { 
    color: "bg-orange-500", 
    emoji: "⚖️", 
    label: "Decision",
    description: "Close to making a decision"
  },
  purchase: { 
    color: "bg-green-500", 
    emoji: "💳", 
    label: "Purchase",
    description: "Ready to buy"
  },
  support: { 
    color: "bg-purple-500", 
    emoji: "🛠️", 
    label: "Support",
    description: "Existing customer needing help"
  },
  retention: { 
    color: "bg-red-500", 
    emoji: "⚠️", 
    label: "Retention",
    description: "May be considering cancellation"
  },
  unknown: { 
    color: "bg-gray-400", 
    emoji: "❓", 
    label: "Unknown",
    description: "Stage is unclear"
  }
};

interface JourneyStageBadgeProps {
  stage: string;
  confidence?: number;
  conversionProbability?: number;
  className?: string;
  showTooltip?: boolean;
}

export function JourneyStageBadge({ 
  stage, 
  confidence, 
  conversionProbability,
  className = "",
  showTooltip = true 
}: JourneyStageBadgeProps) {
  const config = stageConfig[stage as keyof typeof stageConfig] || stageConfig.unknown;
  
  const getConfidenceOpacity = (confidence: number = 0.5) => {
    if (confidence > 0.8) return "opacity-100";
    if (confidence > 0.6) return "opacity-90";
    if (confidence > 0.4) return "opacity-75";
    return "opacity-60";
  };

  const ConversionIndicator = () => {
    if (!conversionProbability) return null;
    
    const probability = Math.round(conversionProbability * 100);
    let probabilityColor = "text-red-500";
    
    if (probability > 70) probabilityColor = "text-green-500";
    else if (probability > 40) probabilityColor = "text-yellow-500";
    
    return (
      <span className={`ml-1 text-xs font-semibold ${probabilityColor}`}>
        {probability}%
      </span>
    );
  };

  return (
    <div className="group relative">
      <Badge 
        className={`${config.color} text-white text-xs ${getConfidenceOpacity(confidence)} ${className}`}
      >
        <span className="mr-1">{config.emoji}</span>
        {config.label}
        {confidence && (
          <span className="ml-1 text-xs opacity-75">
            ({Math.round(confidence * 100)}%)
          </span>
        )}
        <ConversionIndicator />
      </Badge>
      
      {showTooltip && (
        <div className="invisible group-hover:visible absolute z-10 bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs rounded py-1 px-2 whitespace-nowrap">
          {config.description}
          {conversionProbability && (
            <div className="text-xs opacity-75">
              Conversion probability: {Math.round(conversionProbability * 100)}%
            </div>
          )}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black"></div>
        </div>
      )}
    </div>
  );
}