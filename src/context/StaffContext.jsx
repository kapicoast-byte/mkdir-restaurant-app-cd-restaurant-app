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
    pageBg:    'bg-gray-50',
    cardBg:    'bg-white',
    altBg:     'bg-gray-100',
    inputBg:   'bg-white',
    // text
    text:      'text-gray-900',
    textSub:   'text-gray-500',
    textFaint: 'text-gray-400',
    // borders
    border:    'border-gray-200',
    divider:   'divide-gray-100',
    // nav
    navBg:     'bg-white border-t border-gray-200',
    navActive: 'text-indigo-600',
    navInactive:'text-gray-400',
    // inputs
    inputBorder:'border-gray-300',
    inputText: 'text-gray-900 placeholder-gray-400',
    // status badges
    badgePending:   'bg-yellow-100 text-yellow-700',
    badgeProgress:  'bg-blue-100   text-blue-700',
    badgeDone:      'bg-green-100  text-green-700',
    badgeOverdue:   'bg-red-100    text-red-700',
    badgeMissed:    'bg-red-100    text-red-600',
    badgeUpcoming:  'bg-gray-100   text-gray-600',
    badgeDueNow:    'bg-orange-100 text-orange-700',
  },
  dark: {
    pageBg:    'bg-gray-900',
    cardBg:    'bg-gray-800',
    altBg:     'bg-gray-700',
    inputBg:   'bg-gray-700',
    text:      'text-gray-100',
    textSub:   'text-gray-400',
    textFaint: 'text-gray-600',
    border:    'border-gray-700',
    divider:   'divide-gray-700',
    navBg:     'bg-gray-900 border-t border-gray-700',
    navActive: 'text-indigo-400',
    navInactive:'text-gray-500',
    inputBorder:'border-gray-600',
    inputText: 'text-gray-100 placeholder-gray-500',
    badgePending:   'bg-yellow-900 text-yellow-300',
    badgeProgress:  'bg-blue-900   text-blue-300',
    badgeDone:      'bg-green-900  text-green-300',
    badgeOverdue:   'bg-red-900    text-red-300',
    badgeMissed:    'bg-red-900    text-red-400',
    badgeUpcoming:  'bg-gray-700   text-gray-300',
    badgeDueNow:    'bg-orange-900 text-orange-300',
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
