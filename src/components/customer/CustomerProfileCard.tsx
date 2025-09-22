import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Building2, 
  Mail, 
  Phone, 
  Calendar, 
  MessageSquare,
  Bot,
  ExternalLink,
  Edit,
  Target,
  Heart,
  Clock,
  MessageCircle,
  TrendingUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface CustomerProfile {
  id: string;
  whatsapp_instance_id: string;
  phone_number: string;
  name?: string;
  email?: string;
  company?: string;
  customer_stage: 'new' | 'interested' | 'customer' | 'loyal';
  tags: string[];
  conversation_summary?: string;
  key_points: Array<string | { point: string; timestamp: string }>;
  preferences: Record<string, unknown>;
  last_interaction?: string;
  first_interaction: string;
  total_messages: number;
  ai_interactions: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  
  // AI-extracted insights
  customer_intent?: 'purchase' | 'inquiry' | 'support' | 'complaint' | 'comparison';
  customer_mood?: 'happy' | 'frustrated' | 'neutral' | 'excited' | 'confused';
  urgency_level?: 'urgent' | 'high' | 'normal' | 'low';
  communication_style?: 'formal' | 'friendly' | 'direct' | 'detailed';
  journey_stage?: 'first_time' | 'researching' | 'ready_to_buy' | 'existing_customer';
}

interface CustomerProfileCardProps {
  profile: CustomerProfile;
  onEdit?: () => void;
  onOpenChat?: () => void;
  showActions?: boolean;
}

const getStageColor = (stage: string) => {
  switch (stage) {
    case 'new':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    case 'interested':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
    case 'customer':
      return 'bg-green-100 text-green-800 hover:bg-green-200';
    case 'loyal':
      return 'bg-purple-100 text-purple-800 hover:bg-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
  }
};

const getStageLabel = (stage: string) => {
  switch (stage) {
    case 'new':
      return 'New Customer';
    case 'interested':
      return 'Interested';
    case 'customer':
      return 'Customer';
    case 'loyal':
      return 'Loyal Customer';
    default:
      return stage;
  }
};

const getIntentColor = (intent?: string) => {
  switch (intent) {
    case 'purchase':
      return 'bg-green-100 text-green-800 hover:bg-green-200';
    case 'inquiry':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    case 'support':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
    case 'complaint':
      return 'bg-red-100 text-red-800 hover:bg-red-200';
    case 'comparison':
      return 'bg-purple-100 text-purple-800 hover:bg-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
  }
};

const getMoodColor = (mood?: string) => {
  switch (mood) {
    case 'happy':
      return 'bg-green-100 text-green-800 hover:bg-green-200';
    case 'excited':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200';
    case 'neutral':
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    case 'frustrated':
      return 'bg-red-100 text-red-800 hover:bg-red-200';
    case 'confused':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
  }
};

const getUrgencyColor = (urgency?: string) => {
  switch (urgency) {
    case 'urgent':
      return 'bg-red-100 text-red-800 hover:bg-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-200';
    case 'normal':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
    case 'low':
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
  }
};

const openWhatsApp = (phoneNumber: string) => {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleanNumber}`, '_blank');
};

export const CustomerProfileCard: React.FC<CustomerProfileCardProps> = ({
  profile,
  onEdit,
  onOpenChat,
  showActions = true
}) => {
  const getInitials = (name?: string, phone?: string) => {
    if (name) {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    }
    return phone ? phone.slice(-2) : '??';
  };

  const displayName = profile.name || `Customer ${profile.phone_number.slice(-4)}`;
  const lastInteraction = profile.last_interaction ? 
    formatDistanceToNow(new Date(profile.last_interaction), { addSuffix: true }) : 
    'Never';

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(profile.name, profile.phone_number)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">
                {displayName}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {profile.phone_number}
              </CardDescription>
            </div>
          </div>
          <Badge className={getStageColor(profile.customer_stage)}>
            {getStageLabel(profile.customer_stage)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contact Information */}
        {(profile.email || profile.company) && (
          <div className="space-y-2">
            {profile.email && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{profile.email}</span>
              </div>
            )}
            {profile.company && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{profile.company}</span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {profile.tags && profile.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* AI Insights */}
        {(profile.customer_intent || profile.customer_mood || profile.urgency_level || profile.journey_stage) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1">
              <Bot className="h-3 w-3" />
              AI Insights
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {profile.customer_intent && (
                <div className="flex items-center gap-1">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <Badge className={getIntentColor(profile.customer_intent)} variant="secondary">
                    {profile.customer_intent}
                  </Badge>
                </div>
              )}
              {profile.customer_mood && (
                <div className="flex items-center gap-1">
                  <Heart className="h-3 w-3 text-muted-foreground" />
                  <Badge className={getMoodColor(profile.customer_mood)} variant="secondary">
                    {profile.customer_mood}
                  </Badge>
                </div>
              )}
              {profile.urgency_level && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <Badge className={getUrgencyColor(profile.urgency_level)} variant="secondary">
                    {profile.urgency_level}
                  </Badge>
                </div>
              )}
              {profile.journey_stage && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary" className="text-xs">
                    {profile.journey_stage.replace('_', ' ')}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{profile.total_messages}</div>
              <div className="text-xs text-muted-foreground">Messages</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{profile.ai_interactions}</div>
              <div className="text-xs text-muted-foreground">AI Chats</div>
            </div>
          </div>
        </div>

        {/* Last Interaction */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Last interaction: {lastInteraction}</span>
        </div>

        {/* Conversation Summary */}
        {profile.conversation_summary && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Summary</h4>
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              {profile.conversation_summary}
            </p>
          </div>
        )}

        {/* Key Points */}
        {profile.key_points && profile.key_points.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Key Points</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {profile.key_points.slice(0, 3).map((point, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-1 h-1 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <span>{typeof point === 'string' ? point : point.point}</span>
                </li>
              ))}
              {profile.key_points.length > 3 && (
                <li className="text-xs italic">
                  +{profile.key_points.length - 3} more points...
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openWhatsApp(profile.phone_number)}
              className="flex-1"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              WhatsApp
            </Button>
            {onEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={onEdit}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};