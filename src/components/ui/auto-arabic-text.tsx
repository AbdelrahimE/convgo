import React from 'react';
import { hasArabicText } from '@/hooks/useArabicDetection';
import { cn } from '@/lib/utils';

interface AutoArabicTextProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  forceArabic?: boolean;
  mixed?: boolean; // For mixed Arabic/English content
}

/**
 * Component that automatically applies Arabic font to Arabic text
 * Note: Only applies font, keeps LTR direction for regular text elements
 */
export const AutoArabicText: React.FC<AutoArabicTextProps> = ({
  children,
  as: Component = 'span',
  className = '',
  forceArabic = false,
  mixed = false,
  ...props
}) => {
  const text = React.Children.toArray(children).join('');
  const isArabic = forceArabic || hasArabicText(text);
  
  const classes = cn(
    className,
    {
      'font-arabic': isArabic && !mixed, // Only apply font, not RTL direction
      'mixed-content': mixed,
    }
  );
  
  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
};

/**
 * Pre-configured components for common use cases
 */
export const ArabicHeading: React.FC<AutoArabicTextProps> = (props) => (
  <AutoArabicText as="h2" {...props} />
);

export const ArabicParagraph: React.FC<AutoArabicTextProps> = (props) => (
  <AutoArabicText as="p" {...props} />
);

export const ArabicSpan: React.FC<AutoArabicTextProps> = (props) => (
  <AutoArabicText as="span" {...props} />
);

export const ArabicDiv: React.FC<AutoArabicTextProps> = (props) => (
  <AutoArabicText as="div" {...props} />
);

/**
 * Special component for input fields that applies RTL for Arabic content
 */
interface ArabicInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value?: string;
}

export const ArabicInput: React.FC<ArabicInputProps> = ({ value, className = '', ...props }) => {
  const isArabic = hasArabicText(value);
  
  const classes = cn(
    className,
    {
      'font-arabic text-right dir-rtl': isArabic, // Apply RTL only for input fields
    }
  );
  
  return <input className={classes} value={value} {...props} />;
};

/**
 * Special component for textarea fields that applies RTL for Arabic content
 */
interface ArabicTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value?: string;
}

export const ArabicTextarea: React.FC<ArabicTextareaProps> = ({ value, className = '', ...props }) => {
  const isArabic = hasArabicText(value);
  
  const classes = cn(
    className,
    {
      'font-arabic text-right dir-rtl': isArabic, // Apply RTL only for textarea fields
    }
  );
  
  return <textarea className={classes} value={value} {...props} />;
};