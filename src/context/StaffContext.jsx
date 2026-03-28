// Context shared across all staff portal pages.
// Provides: t(), lang, isDark, toggleTheme, and pre-built theme class strings.
//
// StaffLayout initialises this context.  All staff pages read from it via
// useStaffCtx() — this means one Firestore listener for preferredLanguage,
// shared by every component in the portal.
import { createContext, useContext, useState } from 'react';

// ── Theme class maps ──────────────────────────────────────────────────────────
// Each key is a semantic slot; value is the Tailwind class string.
// Pages destructure what they need: const { th } = useStaffCtx();
export const THEMES = {
  light: {
    // backgrounds
    pageBg:    'bg-[#FAFAFA]',
    cardBg:    'bg-white',
    altBg:     'bg-[#F3F4F6]',
    inputBg:   'bg-white',
    // text
    text:      'text-[#111111]',
    textSub:   'text-[#6B7280]',
    textFaint: 'text-[#9CA3AF]',
    // borders
    border:    'border-[#E5E5E5]',
    divider:   'divide-[#E5E5E5]',
    // nav
    navBg:     'bg-white border-t border-[#E5E5E5]',
    navActive: 'text-[#F97316]',
    navInactive:'text-[#9CA3AF]',
    // inputs
    inputBorder:'border-[#E5E5E5]',
    inputText: 'text-[#111111] placeholder-[#9CA3AF]',
    // status badges
    badgePending:   'bg-yellow-100 text-yellow-700',
    badgeProgress:  'bg-blue-100   text-blue-700',
    badgeDone:      'bg-green-100  text-green-700',
    badgeOverdue:   'bg-red-100    text-red-700',
    badgeMissed:    'bg-red-100    text-red-600',
    badgeUpcoming:  'bg-gray-100   text-gray-600',
    badgeDueNow:    'bg-orange-100 text-[#F97316]',
  },
  dark: {
    pageBg:    'bg-[#0F0F0F]',
    cardBg:    'bg-[#1A1A1A]',
    altBg:     'bg-[#222222]',
    inputBg:   'bg-[#222222]',
    text:      'text-[#F5F5F5]',
    textSub:   'text-[#9CA3AF]',
    textFaint: 'text-[#6B7280]',
    border:    'border-[#2A2A2A]',
    divider:   'divide-[#2A2A2A]',
    navBg:     'bg-[#111111] border-t border-[#2A2A2A]',
    navActive: 'text-[#F97316]',
    navInactive:'text-[#6B7280]',
    inputBorder:'border-[#2A2A2A]',
    inputText: 'text-[#F5F5F5] placeholder-[#6B7280]',
    badgePending:   'bg-yellow-900/50 text-yellow-300',
    badgeProgress:  'bg-blue-900/50   text-blue-300',
    badgeDone:      'bg-green-900/50  text-green-300',
    badgeOverdue:   'bg-red-900/50    text-red-300',
    badgeMissed:    'bg-red-900/50    text-red-400',
    badgeUpcoming:  'bg-[#2A2A2A]     text-[#9CA3AF]',
    badgeDueNow:    'bg-orange-900/50 text-orange-300',
  },
};

// ── Context ───────────────────────────────────────────────────────────────────
const StaffContext = createContext(null);

export function StaffProvider({ children, value }) {
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaffCtx() {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error('useStaffCtx must be used inside StaffLayout');
  return ctx;
}
