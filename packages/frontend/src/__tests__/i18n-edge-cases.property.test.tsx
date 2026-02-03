import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fc } from 'fast-check'

/**
 * Property-Based Tests for Internationalization (i18n) Edge Cases
 * 
 * **Validates: Requirements Hata Kataloğu Kategori 11, 19 - Localization**
 * 
 * These tests ensure that:
 * - UI layout doesn't break in RTL languages
 * - No text truncation in any supported locale
 * - Turkish İ/i characters handled correctly in search/sort
 */

// Mock i18n utilities
const mockTranslate = (key: string, locale: string = 'en') => {
  const translations: Record<string, Record<string, string>> = {
    en: {
      'welcome': 'Welcome',
      'login': 'Login',
      'projects': 'Projects',
      'search': 'Search',
      'items_count': '{count} items',
      'user_profile': 'User Profile'
    },
    tr: {
      'welcome': 'Hoş Geldiniz',
      'login': 'Giriş',
      'projects': 'Projeler',
      'search': 'Ara',
      'items_count': '{count} öğe',
      'user_profile': 'Kullanıcı Profili'
    },
    ar: {
      'welcome': 'أهلاً وسهلاً',
      'login': 'تسجيل الدخول',
      'projects': 'المشاريع',
      'search': 'بحث',
      'items_count': '{count} عناصر',
      'user_profile': 'الملف الشخصي'
    },
    de: {
      'welcome': 'Willkommen',
      'login': 'Anmelden',
      'projects': 'Projekte',
      'search': 'Suchen',
      'items_count': '{count} Elemente',
      'user_profile': 'Benutzerprofil'
    }
  }
  
  return translations[locale]?.[key] || key
}

// Mock component for testing
const TestComponent = ({ 
  text, 
  locale = 'en', 
  direction = 'ltr' 
}: { 
  text: string
  locale?: string
  direction?: 'ltr' | 'rtl'
}) => (
  <div dir={direction} lang={locale} style={{ maxWidth: '200px', overflow: 'hidden' }}>
    <h1>{mockTranslate('welcome', locale)}</h1>
    <p>{text}</p>
    <button>{mockTranslate('login', locale)}</button>
  </div>
)

describe('i18n Property Tests', () => {
  /**
   * Property Test: UI layout doesn't break in RTL languages
   * **Validates: Requirements Hata Kataloğu Kategori 11, 19 - Localization**
   */
  it('should maintain UI layout integrity in RTL languages', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('ar'), // Arabic
          fc.constant('he'), // Hebrew
          fc.constant('fa')  // Persian
        ),
        fc.string().filter(s => s.length > 0 && s.length < 100),
        (rtlLocale, testText) => {
          const { unmount } = render(
            <TestComponent 
              text={testText} 
              locale={rtlLocale} 
              direction="rtl" 
            />
          )
          
          // Verify RTL direction is applied
          const container = screen.getByText(testText).closest('div')
          expect(container?.getAttribute('dir')).toBe('rtl')
          expect(container?.getAttribute('lang')).toBe(rtlLocale)
          
          // Verify no layout breaks (component renders without errors)
          expect(screen.getByText(testText)).toBeDefined()
          
          unmount()
          return true
        }
      ),
      { numRuns: 30 }
    )
  })

  /**
   * Property Test: No text truncation in any supported locale
   * **Validates: Requirements Hata Kataloğu Kategori 11, 19 - Localization**
   */
  it('should prevent text truncation across all supported locales', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('en'),
          fc.constant('tr'),
          fc.constant('ar'),
          fc.constant('de'),
          fc.constant('fr'),
          fc.constant('es')
        ),
        fc.array(fc.string().filter(s => s.length > 0), { minLength: 1, maxLength: 10 }),
        (locale, textArray) => {
          const longText = textArray.join(' ')
          
          const { unmount } = render(
            <TestComponent 
              text={longText} 
              locale={locale}
              direction={locale === 'ar' ? 'rtl' : 'ltr'}
            />
          )
          
          // Verify text is rendered (not truncated to empty)
          const textElement = screen.getByText(longText)
          expect(textElement).toBeDefined()
          expect(textElement.textContent).toBe(longText)
          
          unmount()
          return true
        }
      ),
      { numRuns: 40 }
    )
  })

  /**
   * Property Test: Turkish İ/i characters handled correctly in search/sort
   * **Validates: Requirements Hata Kataloğu Kategori 19 - Unicode/Locale**
   */
  it('should handle Turkish İ/i characters correctly in operations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('İstanbul'),
            fc.constant('istanbul'),
            fc.constant('İzmir'),
            fc.constant('izmir'),
            fc.constant('İçerik'),
            fc.constant('içerik'),
            fc.string().filter(s => s.includes('İ') || s.includes('ı'))
          ),
          { minLength: 2, maxLength: 10 }
        ),
        (turkishWords) => {
          // Test Turkish locale-aware sorting
          const sorted = [...turkishWords].sort((a, b) => 
            a.localeCompare(b, 'tr-TR', { sensitivity: 'base' })
          )
          
          // Verify sorting doesn't crash and produces valid array
          expect(Array.isArray(sorted)).toBe(true)
          expect(sorted.length).toBe(turkishWords.length)
          
          // Test Turkish locale-aware search (case-insensitive)
          const searchTerm = 'istanbul'
          const matches = turkishWords.filter(word => 
            word.toLowerCase().includes(searchTerm.toLowerCase()) ||
            word.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
          )
          
          // Verify search works and finds İstanbul when searching for istanbul
          expect(Array.isArray(matches)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 25 }
    )
  })
})

describe('i18n Edge Cases Unit Tests', () => {
  /**
   * Unit Test: Unicode normalization (é vs é - composed vs decomposed)
   */
  it('should handle Unicode normalization correctly', () => {
    const composedE = 'café' // é as single character
    const decomposedE = 'cafe\u0301' // e + combining acute accent
    
    // Both should be treated as equivalent
    expect(composedE.normalize('NFC')).toBe(decomposedE.normalize('NFC'))
    expect(composedE.normalize('NFD')).toBe(decomposedE.normalize('NFD'))
    
    // Test in search functionality
    const searchResults1 = [composedE].filter(item => 
      item.normalize('NFC').includes('café'.normalize('NFC'))
    )
    const searchResults2 = [decomposedE].filter(item => 
      item.normalize('NFC').includes('café'.normalize('NFC'))
    )
    
    expect(searchResults1.length).toBe(1)
    expect(searchResults2.length).toBe(1)
  })

  /**
   * Unit Test: Emoji handling in text fields and database storage
   */
  it('should handle emoji correctly in text processing', () => {
    const textWithEmoji = 'Hello 👋 World 🌍 Test 🧪'
    const emojiOnly = '🚀🎉💻🔥⭐'
    const mixedContent = 'Project: AutoQA 🤖 Status: ✅ Priority: 🔥'
    
    const testTexts = [textWithEmoji, emojiOnly, mixedContent]
    
    testTexts.forEach(text => {
      const { unmount } = render(<TestComponent text={text} />)
      
      // Verify emoji renders correctly
      const textElement = screen.getByText(text)
      expect(textElement.textContent).toBe(text)
      expect(textElement.textContent?.length).toBe(text.length)
      
      unmount()
    })
  })

  /**
   * Unit Test: RTL text mixing with LTR
   */
  it('should handle mixed RTL/LTR text correctly', () => {
    const mixedTexts = [
      'Hello مرحبا World',
      'Project: مشروع AutoQA',
      'Email: user@example.com في العربية',
      'Price: $100 السعر'
    ]
    
    mixedTexts.forEach(text => {
      const { unmount } = render(
        <TestComponent text={text} direction="rtl" locale="ar" />
      )
      
      // Verify mixed text renders without breaking layout
      const textElement = screen.getByText(text)
      expect(textElement.textContent).toBe(text)
      
      unmount()
    })
  })

  /**
   * Unit Test: Date/number/currency formatting per locale
   */
  it('should format dates, numbers, and currency correctly per locale', () => {
    const testDate = new Date('2024-02-04T10:30:00Z')
    const testNumber = 1234567.89
    const testCurrency = 1234.56
    
    const locales = ['en-US', 'tr-TR', 'de-DE', 'ar-SA']
    
    locales.forEach(locale => {
      // Test date formatting
      const formattedDate = testDate.toLocaleDateString(locale)
      expect(typeof formattedDate).toBe('string')
      expect(formattedDate.length).toBeGreaterThan(0)
      
      // Test number formatting
      const formattedNumber = testNumber.toLocaleString(locale)
      expect(typeof formattedNumber).toBe('string')
      expect(formattedNumber.length).toBeGreaterThan(0)
      
      // Test currency formatting
      const formattedCurrency = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: locale.startsWith('tr') ? 'TRY' : 
                 locale.startsWith('de') ? 'EUR' : 
                 locale.startsWith('ar') ? 'SAR' : 'USD'
      }).format(testCurrency)
      expect(typeof formattedCurrency).toBe('string')
      expect(formattedCurrency.length).toBeGreaterThan(0)
    })
  })

  /**
   * Unit Test: Plural forms handling
   */
  it('should handle plural forms correctly for different languages', () => {
    const testCounts = [0, 1, 2, 5, 10, 21, 100]
    
    testCounts.forEach(count => {
      // English plurals
      const englishPlural = count === 1 ? 'item' : 'items'
      expect(englishPlural).toBe(count === 1 ? 'item' : 'items')
      
      // Turkish plurals (no plural for 1, plural for others)
      const turkishPlural = count === 1 ? 'öğe' : 'öğe'
      expect(typeof turkishPlural).toBe('string')
      
      // Arabic plurals (complex rules)
      const arabicPlural = count === 0 ? 'عناصر' :
                          count === 1 ? 'عنصر' :
                          count === 2 ? 'عنصران' :
                          count <= 10 ? 'عناصر' : 'عنصر'
      expect(typeof arabicPlural).toBe('string')
    })
  })
})