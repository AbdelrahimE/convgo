import { Badge } from "@/components/ui/badge";

// Colors and emojis for different emotions
const emotionConfig = {
  excited: { color: "bg-green-500", emoji: "🎉", label: "Excited" },
  frustrated: { color: "bg-red-500", emoji: "😤", label: "Frustrated" },
  satisfied: { color: "bg-blue-500", emoji: "😊", label: "Satisfied" },
  neutral: { color: "bg-gray-500", emoji: "😐", label: "Neutral" },
  concerned: { color: "bg-yellow-500", emoji: "😟", label: "Concerned" },
  angry: { color: "bg-red-600", emoji: "😡", label: "Angry" },
  happy: { color: "bg-green-400", emoji: "😄", label: "Happy" },
  confused: { color: "bg-purple-500", emoji: "😕", label: "Confused" },
  urgent: { color: "bg-orange-500", emoji: "⚡", label: "Urgent" },
  unknown: { color: "bg-gray-400", emoji: "❓", label: "Unknown" }
};

interface EmotionBadgeProps {
  emotion: string;
  intensity?: number;
  className?: string;
}

export function EmotionBadge({ emotion, intensity, className = "" }: EmotionBadgeProps) {
  const config = emotionConfig[emotion as keyof typeof emotionConfig] || emotionConfig.unknown;
  
  // Determine color intensity based on emotion intensity
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