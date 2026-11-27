/**
 * Centralized Dynamic Placeholder Registry
 * Defines all 6 supported placeholders, data contracts, and safe fallback behaviors.
 */

export const PLACEHOLDER_REGISTRY = Object.freeze({
  recipient_name: {
    token: '{{recipient_name}}',
    key: 'recipient_name',
    label: 'Recipient Name',
    description: "Recipient's full name",
    expectedType: 'string',
    isOptional: false,
    defaultFallback: 'Recipient',
    sampleValue: '[Recipient Name]',
    sanitize: (val) => String(val || '').trim(),
  },
  recipient_email: {
    token: '{{recipient_email}}',
    key: 'recipient_email',
    label: 'Recipient Email',
    description: "Recipient's verified email address",
    expectedType: 'email',
    isOptional: false,
    defaultFallback: '',
    sampleValue: '[recipient@domain.com]',
    sanitize: (val) => String(val || '').trim().toLowerCase(),
  },
  institution_name: {
    token: '{{institution_name}}',
    key: 'institution_name',
    label: 'Brand / Organization',
    description: 'Brand or organization name (SNPSUNEXUS)',
    expectedType: 'string',
    isOptional: true,
    defaultFallback: 'SNPSUNEXUS',
    sampleValue: 'SNPSUNEXUS',
    sanitize: (val) => String(val || 'SNPSUNEXUS').trim(),
  },
  designation: {
    token: '{{designation}}',
    key: 'designation',
    label: 'Designation / Role',
    description: 'Recipient title or role',
    expectedType: 'string',
    isOptional: true,
    defaultFallback: '',
    sampleValue: '[Designation]',
    sanitize: (val) => String(val || '').trim(),
  },
  activation_link: {
    token: '{{activation_link}}',
    key: 'activation_link',
    label: 'Activation / Portal Link',
    description: 'Secure, authenticated HTTPS portal URL',
    expectedType: 'url',
    isOptional: false,
    defaultFallback: 'https://snpsunexus.vercel.app',
    sampleValue: 'https://snpsunexus.vercel.app',
    sanitize: (val) => {
      const url = String(val || '').trim();
      // Strict URL protocol validation: allow only https:// and safe http://localhost for local testing
      if (/^(https:\/\/|http:\/\/localhost[:/]|http:\/\/127\.0\.0\.1[:/])/i.test(url)) {
        return url;
      }
      return 'https://snpsunexus.vercel.app';
    },
  },
  current_year: {
    token: '{{current_year}}',
    key: 'current_year',
    label: 'Current Year',
    description: 'Active calendar year (e.g., 2026)',
    expectedType: 'number',
    isOptional: true,
    defaultFallback: String(new Date().getFullYear() || '2026'),
    sampleValue: '2026',
    sanitize: (val) => String(val || new Date().getFullYear() || '2026').trim(),
  },
});

export const SUPPORTED_PLACEHOLDER_KEYS = Object.keys(PLACEHOLDER_REGISTRY);

export const SUPPORTED_PLACEHOLDER_TOKENS = Object.values(PLACEHOLDER_REGISTRY).map((p) => p.token);

/**
 * Detects any placeholders present in text and returns categorized tokens
 */
export function inspectPlaceholders(text) {
  if (!text || typeof text !== 'string') {
    return { found: [], supported: [], unsupported: [] };
  }

  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  const found = [];
  const supported = [];
  const unsupported = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const fullToken = match[0];
    const key = match[1];

    if (!found.includes(fullToken)) {
      found.push(fullToken);
    }

    if (SUPPORTED_PLACEHOLDER_KEYS.includes(key)) {
      if (!supported.includes(fullToken)) {
        supported.push(fullToken);
      }
    } else {
      if (!unsupported.includes(fullToken)) {
        unsupported.push(fullToken);
      }
    }
  }

  return { found, supported, unsupported };
}
