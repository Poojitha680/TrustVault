/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0E1A2B',
          800: '#14243A', // Deep navy
          700: '#1C314E',
          600: '#2A4368',
        },
        primary: {
          DEFAULT: '#2563EB', // Primary blue
          hover: '#1D4ED8',
          light: '#EFF6FF',
          dark: '#1E40AF',
        },
        teal: {
          accent: '#0F766E', // Dark teal
          light: '#F0FDFA',
          border: '#CCFBF1',
        },
        surface: '#FFFFFF', // Surface / cards
        background: '#F5F7FA', // Main background
        text: {
          primary: '#172033', // Primary text
          secondary: '#64748B', // Secondary text
          muted: '#94A3B8',
        },
        border: {
          DEFAULT: '#E2E8F0', // Borders
          subtle: '#F1F5F9',
          strong: '#CBD5E1',
        },
        status: {
          success: '#15803D', // Success
          'success-bg': '#F0FDF4',
          'success-border': '#BBF7D0',
          warning: '#B45309', // Warning
          'warning-bg': '#FFFBEB',
          'warning-border': '#FDE68A',
          error: '#B91C1C', // Error/destructive
          'error-bg': '#FEF2F2',
          'error-border': '#FECACA',
        },
        vault: {
          950: '#F5F7FA',
          900: '#FFFFFF',
          850: '#F8FAFC',
          800: '#14243A',
          700: '#1E293B',
          border: '#E2E8F0',
          accent: '#2563EB',
          teal: '#0F766E',
          success: '#15803D',
          warning: '#B45309',
          error: '#B91C1C',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
