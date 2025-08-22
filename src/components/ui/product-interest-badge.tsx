import { Badge } from "@/components/ui/badge";

// Colors and icons for products and services
const categoryConfig = {
  subscription: { color: "bg-blue-500", emoji: "📅", label: "Subscription" },
  service: { color: "bg-green-500", emoji: "🛠️", label: "Service" },
  product: { color: "bg-purple-500", emoji: "📦", label: "Product" },
  consultation: { color: "bg-yellow-500", emoji: "💬", label: "Consultation" },
  software: { color: "bg-indigo-500", emoji: "💻", label: "Software" },
  training: { color: "bg-orange-500", emoji: "🎓", label: "Training" },
  support: { color: "bg-red-500", emoji: "🆘", label: "Support" },
  unknown: { color: "bg-gray-400", emoji: "❓", label: "Unknown" }
};

const urgencyConfig = {
  low: { color: "bg-green-100 text-green-800", emoji: "⏰", label: "Low" },
  medium: { color: "bg-yellow-100 text-yellow-800", emoji: "⚡", label: "Medium" },
  high: { color: "bg-red-100 text-red-800", emoji: "🔥", label: "High" }
};

interface ProductInterestBadgeProps {
  requestedItem?: string | null;
  category?: string | null;
  urgencyLevel?: string;
  priceDiscussed?: boolean;
  specifications?: string[];
  className?: string;
}

export function ProductInterestBadge({ 
  requestedItem, 
  category, 
  urgencyLevel = "low",
  priceDiscussed = false,
  specifications = [],
  className = ""
}: ProductInterestBadgeProps) {
  
  if (!requestedItem && !category) {
    return (
      <Badge className="bg-gray-200 text-gray-600 text-xs">
        <span className="mr-1">❌</span>
        No specific request
      </Badge>
    );
  }

  const categoryInfo = categoryConfig[category as keyof typeof categoryConfig] || categoryConfig.unknown;
  const urgencyInfo = urgencyConfig[urgencyLevel as keyof typeof urgencyConfig] || urgencyConfig.low;

  return (
    <div className="flex flex-col gap-1">
      {/* Primary product/service */}
      <div className="flex items-center gap-2">
        <Badge className={`${categoryInfo.color} text-white text-xs ${className}`}>
          <span className="mr-1">{categoryInfo.emoji}</span>
          {requestedItem || categoryInfo.label}
        </Badge>
        
        {/* Urgency level */}
        <Badge className={`${urgencyInfo.color} text-xs`}>
          <span className="mr-1">{urgencyInfo.emoji}</span>
          {urgencyInfo.label}
        </Badge>
      </div>

      {/* Additional indicators */}
      <div className="flex flex-wrap gap-1">
        {priceDiscussed && (
          <Badge className="bg-green-100 text-green-700 text-xs">
            <span className="mr-1">💰</span>
            Price discussed
          </Badge>
        )}
        
        {specifications.length > 0 && (
          <Badge className="bg-blue-100 text-blue-700 text-xs">
            <span className="mr-1">📋</span>
            {specifications.length} specs
          </Badge>
        )}
      </div>

      {/* Detailed specifications */}
      {specifications.length > 0 && (
        <div className="text-xs text-gray-600 mt-1">
          <strong>Specifications:</strong> {specifications.slice(0, 2).join(", ")}
          {specifications.length > 2 && ` and ${specifications.length - 2} more...`}
        </div>
      )}
    </div>
  );
}