import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { CustomerProfile } from './CustomerProfileCard';

interface VirtualRowContainerProps {
  profiles: CustomerProfile[];
  renderRow: (profile: CustomerProfile, index: number) => React.ReactNode;
  itemsPerPage?: number;
  className?: string;
}

export const VirtualRowContainer: React.FC<VirtualRowContainerProps> = ({
  profiles,
  renderRow,
  itemsPerPage = 10, // Show 10 items at a time for smooth scrolling
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate which items should be visible based on scroll position
  const visibleRange = useMemo(() => {
    if (!containerHeight || profiles.length === 0) {
      return { start: 0, end: Math.min(itemsPerPage - 1, profiles.length - 1) };
    }

    // Simple calculation: assume each item is approximately 100-150px
    const averageItemHeight = 120;
    const startIndex = Math.floor(scrollTop / averageItemHeight);
    const visibleCount = Math.ceil(containerHeight / averageItemHeight) + 2; // +2 for buffer
    
    const start = Math.max(0, startIndex);
    const end = Math.min(profiles.length - 1, start + visibleCount);

    return { start, end };
  }, [scrollTop, containerHeight, profiles.length, itemsPerPage]);

  // Get visible profiles
  const visibleProfiles = useMemo(() => {
    return profiles.slice(visibleRange.start, visibleRange.end + 1);
  }, [profiles, visibleRange]);

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);

  // Update container height on resize
  useEffect(() => {
    if (!containerRef.current) return;

    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate spacer heights for smooth scrolling effect
  const topSpacerHeight = visibleRange.start * 120; // Approximate height
  const bottomSpacerHeight = (profiles.length - visibleRange.end - 1) * 120;

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      onScroll={handleScroll}
      style={{ height: '100%' }}
    >
      {/* Top spacer for scroll position */}
      {topSpacerHeight > 0 && (
        <div style={{ height: topSpacerHeight }} />
      )}
      
      {/* Visible rows container with proper divide styling */}
      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {visibleProfiles.map((profile, localIndex) => {
          const globalIndex = visibleRange.start + localIndex;
          return (
            <div key={profile.id}>
              {renderRow(profile, globalIndex)}
            </div>
          );
        })}
      </div>

      {/* Bottom spacer for scroll position */}
      {bottomSpacerHeight > 0 && (
        <div style={{ height: bottomSpacerHeight }} />
      )}
    </div>
  );
};

// Hook for managing virtual scroll state
export const useVirtualScroll = (
  itemCount: number,
  estimatedItemHeight: number = 120,
  containerHeight: number = 0,
  scrollTop: number = 0,
  overscan: number = 5
) => {
  return useMemo(() => {
    if (!containerHeight || !itemCount) return { start: 0, end: 0, offsetY: 0 };

    const start = Math.floor(scrollTop / estimatedItemHeight);
    const visibleCount = Math.ceil(containerHeight / estimatedItemHeight);
    
    const startIndex = Math.max(0, start - overscan);
    const endIndex = Math.min(itemCount - 1, start + visibleCount + overscan);
    const offsetY = startIndex * estimatedItemHeight;

    return {
      start: startIndex,
      end: endIndex,
      offsetY
    };
  }, [itemCount, estimatedItemHeight, containerHeight, scrollTop, overscan]);
};