import { Badge } from "@/components/ui/badge";

// الألوان والرموز للمنتجات والخدمات
const categoryConfig = {
  subscription: { color: "bg-blue-500", emoji: "📅", label: "اشتراك" },
  service: { color: "bg-green-500", emoji: "🛠️", label: "خدمة" },
  product: { color: "bg-purple-500", emoji: "📦", label: "منتج" },
  consultation: { color: "bg-yellow-500", emoji: "💬", label: "استشارة" },
  software: { color: "bg-indigo-500", emoji: "💻", label: "برمجيات" },
  training: { color: "bg-orange-500", emoji: "🎓", label: "تدريب" },
  support: { color: "bg-red-500", emoji: "🆘", label: "دعم فني" },
  unknown: { color: "bg-gray-400", emoji: "❓", label: "غير محدد" }
};

const urgencyConfig = {
  low: { color: "bg-green-100 text-green-800", emoji: "⏰", label: "عادي" },
  medium: { color: "bg-yellow-100 text-yellow-800", emoji: "⚡", label: "متوسط" },
  high: { color: "bg-red-100 text-red-800", emoji: "🔥", label: "عاجل" }
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
        لا يوجد طلب محدد
      </Badge>
    );
  }

  const categoryInfo = categoryConfig[category as keyof typeof categoryConfig] || categoryConfig.unknown;
  const urgencyInfo = urgencyConfig[urgencyLevel as keyof typeof urgencyConfig] || urgencyConfig.low;

  return (
    <div className="flex flex-col gap-1">
      {/* المنتج/الخدمة الأساسية */}
      <div className="flex items-center gap-2">
        <Badge className={`${categoryInfo.color} text-white text-xs ${className}`}>
          <span className="mr-1">{categoryInfo.emoji}</span>
          {requestedItem || categoryInfo.label}
        </Badge>
        
        {/* مستوى الاستعجال */}
        <Badge className={`${urgencyInfo.color} text-xs`}>
          <span className="mr-1">{urgencyInfo.emoji}</span>
          {urgencyInfo.label}
        </Badge>
      </div>

      {/* مؤشرات إضافية */}
      <div className="flex flex-wrap gap-1">
        {priceDiscussed && (
          <Badge className="bg-green-100 text-green-700 text-xs">
            <span className="mr-1">💰</span>
            تم مناقشة السعر
          </Badge>
        )}
        
        {specifications.length > 0 && (
          <Badge className="bg-blue-100 text-blue-700 text-xs">
            <span className="mr-1">📋</span>
            {specifications.length} مواصفات
          </Badge>
        )}
      </div>

      {/* المواصفات التفصيلية */}
      {specifications.length > 0 && (
        <div className="text-xs text-gray-600 mt-1">
          <strong>المواصفات:</strong> {specifications.slice(0, 2).join("، ")}
          {specifications.length > 2 && ` و ${specifications.length - 2} أخرى...`}
        </div>
      )}
    </div>
  );
}