import { Badge } from "@/components/ui/badge";

// الألوان والرموز التعبيرية للمشاعر المختلفة
const emotionConfig = {
  excited: { color: "bg-green-500", emoji: "🎉", label: "متحمس" },
  frustrated: { color: "bg-red-500", emoji: "😤", label: "محبط" },
  satisfied: { color: "bg-blue-500", emoji: "😊", label: "راضٍ" },
  neutral: { color: "bg-gray-500", emoji: "😐", label: "عادي" },
  concerned: { color: "bg-yellow-500", emoji: "😟", label: "قلق" },
  angry: { color: "bg-red-600", emoji: "😡", label: "غاضب" },
  happy: { color: "bg-green-400", emoji: "😄", label: "سعيد" },
  confused: { color: "bg-purple-500", emoji: "😕", label: "مرتبك" },
  urgent: { color: "bg-orange-500", emoji: "⚡", label: "عاجل" },
  unknown: { color: "bg-gray-400", emoji: "❓", label: "غير محدد" }
};

interface EmotionBadgeProps {
  emotion: string;
  intensity?: number;
  className?: string;
}

export function EmotionBadge({ emotion, intensity, className = "" }: EmotionBadgeProps) {
  const config = emotionConfig[emotion as keyof typeof emotionConfig] || emotionConfig.unknown;
  
  // تحديد شدة اللون بناءً على كثافة المشاعر
  const getIntensityOpacity = (intensity: number = 0.5) => {
    if (intensity > 0.8) return "opacity-100";
    if (intensity > 0.6) return "opacity-90";
    if (intensity > 0.4) return "opacity-75";
    return "opacity-60";
  };

  return (
    <Badge 
      className={`${config.color} text-white text-xs ${getIntensityOpacity(intensity)} ${className}`}
    >
      <span className="mr-1">{config.emoji}</span>
      {config.label}
      {intensity && (
        <span className="ml-1 text-xs">
          ({Math.round(intensity * 100)}%)
        </span>
      )}
    </Badge>
  );
}