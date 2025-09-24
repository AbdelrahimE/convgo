import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  TrendingUp,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { CustomerProfile } from './CustomerProfileCard';

interface CustomerProfileRowProps {
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
      return 'New';
    case 'interested':
      return 'Interested';
    case 'customer':
      return 'Customer';
    case 'loyal':
      return 'Loyal';
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

export const CustomerProfileRow: React.FC<CustomerProfileRowProps> = React.memo(({
  profile,
  onEdit,
  onOpenChat,
  showActions = true
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

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
  
  const handleEditClick = () => {
    const encodedPhoneNumber = encodeURIComponent(profile.phone_number);
    navigate(`/customer-profiles/edit/${profile.whatsapp_instance_id}/${encodedPhoneNumber}`);
  };

  return (
    <Collapsible 
      open={isExpanded} 
      onOpenChange={setIsExpanded}
      className="w-full"
    >
      {/* Main Row */}
      <div className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center justify-between p-4 gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Avatar & Name */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage 
                  src="/images/default-avatar.png" 
                  alt="User Avatar"
                />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {getInitials(profile.name, profile.phone_number)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  {displayName}
                </div>
                <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{profile.phone_number}</span>
                </div>
              </div>
            </div>

            {/* Stage Badge - Hidden on mobile */}
            <div className="hidden sm:block flex-shrink-0">
              <Badge className={getStageColor(profile.customer_stage)}>
                {getStageLabel(profile.customer_stage)}
              </Badge>
            </div>

            {/* Stats - Hidden on small screens */}
            <div className="hidden md:flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>{profile.total_messages}</span>
              </div>
              <div className="flex items-center gap-1">
                <Bot className="h-4 w-4" />
                <span>{profile.ai_interactions}</span>
              </div>
            </div>

            {/* Last Interaction - Hidden on mobile */}
            <div className="hidden lg:block text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">
              {lastInteraction}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {showActions && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openWhatsApp(profile.phone_number)}
                  className="hidden sm:flex bg-green-100 text-green-800 hover:bg-green-200 border-green-300 border"
                >
                  <ExternalLink className="h-4 w-4 mr-0" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEditClick}
                  className="hidden sm:flex"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Expand/Collapse Button */}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="p-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        {/* Mobile Stage Badge */}
        <div className="sm:hidden px-4 pb-3">
          <Badge className={getStageColor(profile.customer_stage)}>
            {getStageLabel(profile.customer_stage)}
          </Badge>
        </div>
      </div>

      {/* Expanded Content */}
      <CollapsibleContent>
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-4">
            {/* Contact Information & Company */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Contact Information</h4>
                <div className="space-y-2">
                  {profile.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="break-all">{profile.email}</span>
                    </div>
                  )}
                  {profile.company && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Building2 className="h-4 w-4 flex-shrink-0" />
                      <span>{profile.company}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>Last interaction: {lastInteraction}</span>
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Engagement Stats</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="h-4 w-4 text-slate-500" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{profile.total_messages}</div>
                      <div className="text-xs text-slate-500">Messages</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Bot className="h-4 w-4 text-slate-500" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{profile.ai_interactions}</div>
                      <div className="text-xs text-slate-500">AI Chats</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            {profile.tags && profile.tags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {profile.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights */}
            {(profile.customer_intent || profile.customer_mood || profile.urgency_level || profile.journey_stage) && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  <Bot className="h-4 w-4" />
                  AI Insights
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {profile.customer_intent && (
                    <div className="flex items-center gap-1">
                      <Target className="h-3 w-3 text-slate-500" />
                      <Badge className={getIntentColor(profile.customer_intent)} variant="secondary">
                        {profile.customer_intent}
                      </Badge>
                    </div>
                  )}
                  {profile.customer_mood && (
                    <div className="flex items-center gap-1">
                      <Heart className="h-3 w-3 text-slate-500" />
                      <Badge className={getMoodColor(profile.customer_mood)} variant="secondary">
                        {profile.customer_mood}
                      </Badge>
                    </div>
                  )}
                  {profile.urgency_level && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      <Badge className={getUrgencyColor(profile.urgency_level)} variant="secondary">
                        {profile.urgency_level}
                      </Badge>
                    </div>
                  )}
                  {profile.journey_stage && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-slate-500" />
                      <Badge variant="secondary" className="text-xs">
                        {profile.journey_stage.replace('_', ' ')}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Conversation Summary */}
            {profile.conversation_summary && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Conversation Summary</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-700">
                  {profile.conversation_summary}
                </p>
              </div>
            )}

            {/* Key Points */}
            {profile.key_points && profile.key_points.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Key Points</h4>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  {profile.key_points.map((point, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="w-1 h-1 bg-primary rounded-full mt-2 flex-shrink-0" />
                      <span>{typeof point === 'string' ? point : point.point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Mobile Actions */}
            {showActions && (
              <div className="sm:hidden space-y-2">
                <Separator />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openWhatsApp(profile.phone_number)}
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEditClick}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});